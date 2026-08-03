import type { Pose, Keypoint } from '@tensorflow-models/pose-detection';

export type Phase = 'idle' | 'en_garde' | 'lunging' | 'recovering';

export type FeedbackType = 'good' | 'bad' | 'info';

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  message: string;
  cue: string;
  weight: number;
  passed: boolean;
}

export interface LungeMetrics {
  durationMs: number;
  speed: number;
  speedMs: number | null;
  hipTravel: number;
  frontFootTravel: number;
  peakStance: number;
  backLegAngle: number;
  frontKneeAngle: number;
  torsoLean: number;
  footLift: number;
  backArmSwing: number;
  kneeOverToe: number;
  armTimingMs: number | null;
}

export interface LungeEvent extends LungeMetrics {
  id: string;
  ts: number;
  score: number;
  feedbacks: FeedbackItem[];
}

export interface FrameMetrics {
  phase: Phase;
  hasPose: boolean;
  stance: number;
  frontKneeAngle: number;
  backLegAngle: number;
  frontArmAngle: number;
  backArmAngle: number;
  torsoLean: number;
  footLift: number;
  hipSpeed: number;
  confidence: number;
}

interface Smoothed {
  x: number;
  y: number;
  score: number;
}

type Side = 'left' | 'right';

const LEFT = 'left_';
const RIGHT = 'right_';

const EG_HOLD = 5;
const RECOVERY_HOLD = 4;
const ONSET_VEL = 0.6;
const ONSET_FRAMES = 2;
const RECOVERY_FRAMES = 3;
const LUNGE_TIMEOUT_MS = 4200;
const MIN_PEAK_STANCE = 1.25;
const MIN_HIP_TRAVEL = 0.28;
const MIN_DURATION = 120;
const MAX_DURATION = 3000;
const BACK_DRIFT_LIMIT = 0.52;
const CANCEL_DRIFT = 0.6;
const POS = 0.3;

function angle(A: Keypoint, B: Keypoint, C: Keypoint): number {
  const ab = Math.hypot(B.x - A.x, B.y - A.y);
  const bc = Math.hypot(B.x - C.x, B.y - C.y);
  const ac = Math.hypot(C.x - A.x, C.y - A.y);
  if (ab < 1e-6 || bc < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (ab * ab + bc * bc - ac * ac) / (2 * ab * bc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Peak {
  stance: number;
  backLegAngle: number;
  frontKneeAngle: number;
  torsoLean: number;
  backWristFwd: number;
  frontKneeFwd: number;
  frontAnkleFwd: number;
}

interface Run {
  startTs: number;
  startHipFwd: number;
  startFrontAnkleFwd: number;
  startBackAnkleFwd: number;
  minFrontAnkleY: number;
  hipTravelPx: number;
  frontFootTravelPx: number;
  motionStopAt: number | null;
  armCrossAt: number | null;
  peak: Peak;
}

export class LungeAnalyzer {
  private phase: Phase = 'idle';
  private sm: Record<string, Smoothed> = {};
  private faceDir = 0;
  private scale = 0;
  private lastTs = 0;
  private frontSide: Side = 'right';
  private backSide: Side = 'left';
  private frontAnkleS = 0;
  private prevHipS: number | null = null;
  private frontVelX = 0;
  private hipVelX = 0;
  private stance = 0;
  private a = { frontKnee: 0, backLeg: 0, frontArm: 0, backArm: 0, lean: 0 };

  private egHolds = 0;
  private recoveryHolds = 0;
  private onsetFrames = 0;
  private recoveryFrames = 0;
  private cooldownUntil = 0;
  private armExtended = false;
  private armExtendedSince = 0;

  private base = { ankleY: 0, backWristFwd: 0, ankleFwd: 0, backAnkleFwd: 0 };
  private run: Run | null = null;

  private userHeightCm = 175;
  private counter = 0;
  private lastFrame: FrameMetrics;

  private onLunge: (e: LungeEvent) => void;
  private onPhase: (p: Phase) => void;

  constructor(onLunge: (e: LungeEvent) => void, onPhase: (p: Phase) => void) {
    this.onLunge = onLunge;
    this.onPhase = onPhase;
    this.lastFrame = this.emptyFrame();
  }

  setUserHeightCm(cm: number) {
    this.userHeightCm = Math.max(120, Math.min(230, cm || 175));
  }

  getPhase(): Phase {
    return this.phase;
  }

  reset() {
    this.phase = 'idle';
    this.faceDir = 0;
    this.egHolds = 0;
    this.recoveryHolds = 0;
    this.onsetFrames = 0;
    this.recoveryFrames = 0;
    this.cooldownUntil = 0;
    this.armExtended = false;
    this.run = null;
    this.prevHipS = null;
    this.setPhase('idle');
  }

  private uid(): string {
    this.counter += 1;
    return `${Date.now().toString(36)}-${this.counter}`;
  }

  private setPhase(p: Phase) {
    if (this.phase !== p) {
      this.phase = p;
      this.onPhase(p);
    }
  }

  private emptyFrame(): FrameMetrics {
    return {
      phase: 'idle',
      hasPose: false,
      stance: 0,
      frontKneeAngle: 0,
      backLegAngle: 0,
      frontArmAngle: 0,
      backArmAngle: 0,
      torsoLean: 0,
      footLift: 0,
      hipSpeed: 0,
      confidence: 0,
    };
  }

  analyzeFrame(poses: Pose[], ts: number): FrameMetrics {
    const r = this.collect(poses && poses.length ? poses[0] : undefined);

    const hasPose =
      !!r &&
      !!r['nose'] &&
      !!r[LEFT + 'ankle'] &&
      !!r[RIGHT + 'ankle'] &&
      !!r[LEFT + 'shoulder'] &&
      !!r[RIGHT + 'shoulder'] &&
      !!r[LEFT + 'hip'] &&
      !!r[RIGHT + 'hip'];

    if (!hasPose || !r || !ts) {
      this.egHolds = 0;
      this.recoveryHolds = 0;
      this.armExtended = false;
      this.lastFrame.hasPose = false;
      return this.lastFrame;
    }

    const dt = Math.max(this.lastTs ? (ts - this.lastTs) / 1000 : 1 / 30, 1 / 90);
    this.lastTs = ts;

    const sMidX = (r[LEFT + 'shoulder'].x + r[RIGHT + 'shoulder'].x) / 2;
    const faceNow = r['nose'].x >= sMidX ? 1 : -1;
    if (this.faceDir === 0) this.faceDir = faceNow;
    else this.faceDir = this.faceDir * 0.7 + faceNow * 0.3 > 0 ? 1 : -1;
    const fwd = (x: number) => x * this.faceDir;

    const targetS =
      (Math.hypot(r[LEFT + 'shoulder'].x - r[LEFT + 'hip'].x, r[LEFT + 'shoulder'].y - r[LEFT + 'hip'].y) +
        Math.hypot(r[RIGHT + 'shoulder'].x - r[RIGHT + 'hip'].x, r[RIGHT + 'shoulder'].y - r[RIGHT + 'hip'].y)) /
      2;
    this.scale = this.scale === 0 ? targetS : this.scale * 0.7 + targetS * 0.3;
    if (this.scale < 4) {
      this.lastFrame.hasPose = false;
      return this.lastFrame;
    }

    this.updateSmoothing(r);

    const rawLaf = fwd(r[LEFT + 'ankle'].x);
    const rawRaf = fwd(r[RIGHT + 'ankle'].x);
    this.frontSide = this.frontSide === 'left' ? (rawLaf >= rawRaf ? 'left' : 'right') : rawRaf >= rawLaf ? 'right' : 'left';
    this.backSide = this.frontSide === 'left' ? 'right' : 'left';

    const L = (j: string) => this.sm[(this.frontSide === 'left' ? LEFT : RIGHT) + j];
    const B = (j: string) => this.sm[(this.backSide === 'left' ? LEFT : RIGHT) + j];
    const LA = L('ankle') as Smoothed;
    const BA = B('ankle') as Smoothed;
    const hipF = L('hip') as Smoothed;
    const hipBk = B('hip') as Smoothed;
    const kneeF = L('knee') as Smoothed;
    const kneeBk = B('knee') as Smoothed;
    const shF = L('shoulder') as Smoothed;
    const elbF = L('elbow') as Smoothed;
    const wrF = L('wrist') as Smoothed;
    const wrB = B('wrist') as Smoothed;
    const elbB = B('elbow') as Smoothed;
    if (!LA || !BA || !hipF || !hipBk || !kneeF || !kneeBk || !shF || !elbB || !elbF || !wrF || !wrB) return this.lastFrame;

    const hipMid = (this.sm[LEFT + 'hip'].x + this.sm[RIGHT + 'hip'].x) / 2;
    const shMid = (this.sm[LEFT + 'shoulder'].x + this.sm[RIGHT + 'shoulder'].x) / 2;
    const shMidY = (this.sm[LEFT + 'shoulder'].y + this.sm[RIGHT + 'shoulder'].y) / 2;

    const stance = Math.abs(fwd(LA.x) - fwd(BA.x)) / this.scale;
    const angles = {
      frontKnee: angle(hipF, kneeF, LA),
      backLeg: angle(hipBk, kneeBk, BA),
      frontArm: angle(shF, elbF, wrF),
      backArm: angle({ x: shMid, y: shMidY }, elbB, wrB),
      lean: fwd(shMid - hipMid) / this.scale,
    };
    this.a = angles;
    this.stance = stance;

    const tF = fwd(LA.x) / this.scale;
    const prevF = this.frontAnkleS === 0 ? tF : this.frontAnkleS;
    this.frontAnkleS = lerp(prevF, tF, 0.4);
    this.frontVelX = lerp(this.frontVelX, (this.frontAnkleS - prevF) / dt, 0.4);

    const hipCurrent = fwd(hipMid) / this.scale;
    const hv = this.prevHipS === null ? 0 : (hipCurrent - this.prevHipS) / dt;
    this.prevHipS = hipCurrent;
    this.hipVelX = lerp(this.hipVelX, hv, 0.4);

    this.tick();
    this.lastFrame = this.buildFrame();
    return this.lastFrame;
  }

  private collect(pose: Pose | undefined): Record<string, Keypoint> {
    const out: Record<string, Keypoint> = {};
    if (!pose || !pose.keypoints) return out;
    for (const kp of pose.keypoints) {
      if (kp.name && (kp.score ?? 0) >= POS) out[kp.name] = kp;
    }
    return out;
  }

  private updateSmoothing(r: Record<string, Keypoint>) {
    for (const kp of Object.values(r)) {
      if (!kp.name) continue;
      const prev = this.sm[kp.name];
      this.sm[kp.name] = prev
        ? { x: lerp(prev.x, kp.x, 0.45), y: lerp(prev.y, kp.y, 0.45), score: kp.score ?? 0 }
        : { x: kp.x, y: kp.y, score: kp.score ?? 0 };
    }
  }

  private enGardeOk(stance: number, a: { frontKnee: number; backLeg: number }): boolean {
    return stance >= 0.8 && stance <= 2.7 && a.frontKnee <= 160 && a.backLeg <= 160;
  }

  private tick() {
    const stance = this.stance;
    const a = this.a;
    switch (this.phase) {
      case 'idle':
        if (this.enGardeOk(stance, a)) this.egHolds += 1;
        else this.egHolds = 0;
        if (this.egHolds >= EG_HOLD) this.enterEnGarde();
        break;

      case 'en_garde':
        if (stance < 0.7) {
          this.setPhase('idle');
          break;
        }
        if (this.enGardeOk(stance, a)) {
          if (!this.armExtended && a.frontArm >= 150) {
            this.armExtended = true;
            this.armExtendedSince = this.lastTs;
          } else if (this.armExtended && a.frontArm < 135) {
            this.armExtended = false;
            this.armExtendedSince = 0;
          }
        }
        if (this.lastTs < this.cooldownUntil) break;
        {
          const ba = this.sm[(this.backSide === 'left' ? LEFT : RIGHT) + 'ankle'];
          const backDrift = ba ? Math.abs((ba.x * this.faceDir - this.base.backAnkleFwd) / this.scale) : 0;
          if (this.frontVelX > ONSET_VEL && backDrift < BACK_DRIFT_LIMIT) this.onsetFrames += 1;
          else if (this.frontVelX < 0.2) this.onsetFrames = 0;
          if (this.onsetFrames >= ONSET_FRAMES) this.beginRun();
        }
        break;

      case 'lunging':
        this.driveRun();
        break;

      case 'recovering':
        if (this.enGardeOk(stance, a)) this.recoveryHolds += 1;
        else this.recoveryHolds = 0;
        if (this.recoveryHolds >= RECOVERY_HOLD) {
          this.recoveryHolds = 0;
          this.enterEnGarde();
        } else if (stance < 0.7) {
          this.recoveryHolds = 0;
          this.setPhase('idle');
        }
        break;
    }
  }

  private enterEnGarde() {
    const L = (j: string) => this.sm[(this.frontSide === 'left' ? LEFT : RIGHT) + j];
    const B = (j: string) => this.sm[(this.backSide === 'left' ? LEFT : RIGHT) + j];
    const la = L('ankle') as Smoothed;
    const ba = B('ankle') as Smoothed;
    const wrB = B('wrist') as Smoothed;
    this.base = {
      ankleY: la ? la.y : 0,
      backWristFwd: wrB ? wrB.x * this.faceDir : 0,
      ankleFwd: la ? la.x * this.faceDir : 0,
      backAnkleFwd: ba ? ba.x * this.faceDir : 0,
    };
    this.egHolds = 0;
    this.armExtended = this.a.frontArm >= 150;
    this.armExtendedSince = this.armExtended ? this.lastTs : 0;
    this.onsetFrames = 0;
    this.setPhase('en_garde');
  }

  private beginRun() {
    const hipMid = (this.sm[LEFT + 'hip'].x + this.sm[RIGHT + 'hip'].x) / 2;
    const L = (j: string) => this.sm[(this.frontSide === 'left' ? LEFT : RIGHT) + j];
    const B = (j: string) => this.sm[(this.backSide === 'left' ? LEFT : RIGHT) + j];
    const la = L('ankle') as Smoothed;
    const ba = B('ankle') as Smoothed;
    const kneeF = L('knee') as Smoothed;
    const wrB = B('wrist') as Smoothed;
    this.run = {
      startTs: this.lastTs,
      startHipFwd: hipMid * this.faceDir,
      startFrontAnkleFwd: la ? la.x * this.faceDir : 0,
      startBackAnkleFwd: ba ? ba.x * this.faceDir : 0,
      minFrontAnkleY: la ? la.y : 1e9,
      hipTravelPx: 0,
      frontFootTravelPx: 0,
      motionStopAt: null,
      armCrossAt: this.armExtended && this.armExtendedSince > 0 ? 0 : null,
      peak: {
        stance: this.stance,
        backLegAngle: this.a.backLeg,
        frontKneeAngle: this.a.frontKnee,
        torsoLean: this.a.lean,
        backWristFwd: wrB ? wrB.x * this.faceDir : 0,
        frontKneeFwd: kneeF ? kneeF.x * this.faceDir : 0,
        frontAnkleFwd: la ? la.x * this.faceDir : 0,
      },
    };
    this.onsetFrames = 0;
    this.recoveryFrames = 0;
    this.setPhase('lunging');
  }

  private driveRun() {
    const run = this.run;
    if (!run) {
      this.setPhase('recovering');
      return;
    }
    const L = (j: string) => this.sm[(this.frontSide === 'left' ? LEFT : RIGHT) + j];
    const B = (j: string) => this.sm[(this.backSide === 'left' ? LEFT : RIGHT) + j];
    const la = L('ankle') as Smoothed;
    const ba = B('ankle') as Smoothed;
    const kneeF = L('knee') as Smoothed;
    const hipMid = (this.sm[LEFT + 'hip'].x + this.sm[RIGHT + 'hip'].x) / 2;

    if (la && la.y < run.minFrontAnkleY) run.minFrontAnkleY = la.y;
    if (la) run.frontFootTravelPx = Math.max(run.frontFootTravelPx, la.x * this.faceDir - run.startFrontAnkleFwd);
    run.hipTravelPx = Math.max(run.hipTravelPx, hipMid * this.faceDir - run.startHipFwd);

    if (this.stance >= run.peak.stance - 0.02) {
      run.peak = {
        stance: this.stance,
        backLegAngle: this.a.backLeg,
        frontKneeAngle: this.a.frontKnee,
        torsoLean: this.a.lean,
        backWristFwd: (B('wrist') as Smoothed) ? (B('wrist') as Smoothed).x * this.faceDir : run.peak.backWristFwd,
        frontKneeFwd: kneeF ? kneeF.x * this.faceDir : run.peak.frontKneeFwd,
        frontAnkleFwd: la ? la.x * this.faceDir : run.peak.frontAnkleFwd,
      };
    }

    if (run.armCrossAt === null && this.a.frontArm >= 150) run.armCrossAt = this.lastTs;
    if (run.motionStopAt === null && this.frontVelX < 0.12) run.motionStopAt = this.lastTs;

    const backDrift = ba ? Math.abs((ba.x * this.faceDir - run.startBackAnkleFwd) / this.scale) : 0;
    if (backDrift > CANCEL_DRIFT) {
      this.run = null;
      this.cooldownUntil = this.lastTs + 450;
      this.recoveryHolds = 0;
      this.setPhase('recovering');
      return;
    }
    if (this.stance < 0.85 && run.hipTravelPx / this.scale < MIN_HIP_TRAVEL) {
      this.run = null;
      this.cooldownUntil = this.lastTs + 450;
      this.setPhase('idle');
      return;
    }

    if (this.frontVelX < -0.22 || this.stance < run.peak.stance - 0.3) this.recoveryFrames += 1;
    else if (this.frontVelX > 0.1) this.recoveryFrames = 0;
    if (this.recoveryFrames >= RECOVERY_FRAMES) {
      this.finishRun(run);
      this.run = null;
      this.recoveryFrames = 0;
      this.cooldownUntil = this.lastTs + 500;
      this.setPhase('recovering');
      return;
    }
    if (this.lastTs - run.startTs > LUNGE_TIMEOUT_MS) {
      this.finishRun(run);
      this.run = null;
      this.cooldownUntil = this.lastTs + 400;
      this.setPhase('recovering');
    }
  }

  private finishRun(run: Run) {
    const p = run.peak;
    const durationMs = run.motionStopAt ? run.motionStopAt - run.startTs : this.lastTs - run.startTs;
    const valid =
      durationMs >= MIN_DURATION &&
      durationMs <= MAX_DURATION &&
      p.stance >= MIN_PEAK_STANCE &&
      run.hipTravelPx / this.scale >= MIN_HIP_TRAVEL;

    if (!valid) return;

    this.onLunge(this.buildEvent(run, durationMs));
  }

  private buildEvent(run: Run, durationMs: number): LungeEvent {
    const p = run.peak;
    const hipTravel = run.hipTravelPx / this.scale;
    const frontFootTravel = run.frontFootTravelPx / this.scale;
    const speed = durationMs > 0 ? hipTravel / (durationMs / 1000) : 0;
    const speedMs = this.estimateMetersPerSec(run.hipTravelPx, durationMs);

    const footLift = Math.max(0, (this.base.ankleY - run.minFrontAnkleY) / this.scale);
    const backArmSwing = (this.base.backWristFwd - p.backWristFwd) / this.scale;
    const kneeOverToe = (p.frontKneeFwd - p.frontAnkleFwd) / this.scale;
    const armTimingMs =
      run.armCrossAt === 0 ? 0 : run.armCrossAt === null ? null : run.armCrossAt - run.startTs;

    const feedbacks = this.evaluateFeedback({
      armTimingMs,
      backLegAngle: p.backLegAngle,
      frontKneeAngle: p.frontKneeAngle,
      torsoLean: p.torsoLean,
      footLift,
      backArmSwing,
      kneeOverToe,
    });

    const score = feedbacks.reduce((acc, f) => acc + (f.passed ? f.weight : 0), 0);

    return {
      id: this.uid(),
      ts: this.lastTs,
      durationMs,
      speed,
      speedMs,
      hipTravel,
      frontFootTravel,
      peakStance: p.stance,
      backLegAngle: p.backLegAngle,
      frontKneeAngle: p.frontKneeAngle,
      torsoLean: p.torsoLean,
      footLift,
      backArmSwing,
      kneeOverToe,
      armTimingMs,
      score,
      feedbacks,
    };
  }

  private estimateMetersPerSec(hipPx: number, durationMs: number): number | null {
    const nose = this.sm['nose'];
    const la = this.sm[LEFT + 'ankle'];
    const ra = this.sm[RIGHT + 'ankle'];
    if (!nose || !la || !ra) return null;
    const top = nose.y;
    const bottom = Math.max(la.y, ra.y);
    const pixelH = Math.max(0, bottom - top);
    if (pixelH < 120 || hipPx <= 0 || durationMs <= 0) return null;
    const mPerPx = this.userHeightCm / 100 / pixelH;
    return (hipPx * mPerPx) / (durationMs / 1000);
  }

  private evaluateFeedback(m: {
    armTimingMs: number | null;
    backLegAngle: number;
    frontKneeAngle: number;
    torsoLean: number;
    footLift: number;
    backArmSwing: number;
    kneeOverToe: number;
  }): FeedbackItem[] {
    const out: FeedbackItem[] = [];
    const add = (weight: number, passed: boolean, type: FeedbackType, message: string, cue: string) => {
      out.push({ id: this.uid(), type: passed ? 'good' : type, message, cue, weight, passed });
    };

    if (m.armTimingMs !== null) {
      add(
        16,
        m.armTimingMs <= 200,
        'bad',
        m.armTimingMs <= 200
          ? 'Weapon arm extended as the front foot drove off.'
          : 'Weapon arm is late — the arm should lead as the foot starts.',
        'Arm leads the foot',
      );
    } else {
      add(16, false, 'bad', 'Weapon arm barely extended — finish reaching toward the target.', 'Fully extend the arm');
    }

    if (m.backLegAngle >= 162) add(16, true, 'good', 'Back leg drives through to full extension.', 'Drive the back leg straight');
    else if (m.backLegAngle >= 150) add(16, true, 'info', 'Back leg is nearly straight — push out the last degrees.', 'Finish the knee');
    else add(16, false, 'bad', 'Back leg stays bent at extension — drive it straight to finish.', 'Drive the back leg straight');

    if (m.backArmSwing >= 0.26) add(14, true, 'good', 'Back arm swept behind to counterbalance the lunge.', 'Sweep the back arm back');
    else add(14, false, 'bad', 'Back arm stays forward — swing it back for balance, not up.', 'Back arm goes back');

    if (Math.abs(m.torsoLean) <= 0.5) add(14, true, 'good', 'Torso stayed upright through the lunge.', 'Keep the torso tall');
    else if (m.torsoLean > 0.5) add(14, false, 'bad', 'Torso collapses over the front knee — chest up, hips low.', 'Stay tall');
    else add(14, false, 'bad', 'Torso leans back — push the weight over the front foot.', 'Lean into the lunge');

    if (m.footLift <= 0.16) add(12, true, 'good', 'Front foot stayed low and slid through the lunge.', 'Slide the front foot');
    else add(12, false, 'bad', 'Front foot lifts off the floor — slide it, keep the heel low.', 'Keep the foot low');

    if (m.kneeOverToe <= 0.12) add(13, true, 'good', 'Front knee tracked over the heel, shin vertical.', 'Knee over the heel');
    else add(13, false, 'bad', 'Front knee drives past the toes — keep the shin vertical.', 'Knee stays over the heel');

    if (m.frontKneeAngle >= 70 && m.frontKneeAngle <= 128) add(15, true, 'good', 'Front knee bent deep and under control.', 'Deep controlled knee');
    else if (m.frontKneeAngle < 70) add(15, false, 'bad', 'Front knee collapsed — brace it to a right angle.', 'Brace the front knee');
    else add(15, false, 'bad', 'Front knee barely bends — sit deeper into the lunge.', 'Drive the knee deeper');

    if (out.length > 0 && out.every((f) => f.passed)) {
      out.push({ id: this.uid(), type: 'good', message: 'Clean, textbook lunge.', cue: 'Perfect form', weight: 0, passed: true });
    }
    return out;
  }

  private buildFrame(): FrameMetrics {
    const run = this.run;
    const footLift = run ? Math.max(0, (this.base.ankleY - run.minFrontAnkleY) / this.scale) : 0;
    return {
      phase: this.phase,
      hasPose: true,
      stance: this.stance,
      frontKneeAngle: this.a.frontKnee,
      backLegAngle: this.a.backLeg,
      frontArmAngle: this.a.frontArm,
      backArmAngle: this.a.backArm,
      torsoLean: this.a.lean,
      footLift,
      hipSpeed: this.hipVelX,
      confidence: this.scale > 0 ? 1 : 0,
    };
  }
}
