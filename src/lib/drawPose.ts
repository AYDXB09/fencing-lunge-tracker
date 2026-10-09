import * as poseDetection from '@tensorflow-models/pose-detection';
import type { Keypoint } from '@tensorflow-models/pose-detection';
import type { FrameMetrics } from './LungeAnalyzer';

type Side = 'left' | 'right';

const BONES: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

const BRASS = '217,165,78';
const STEEL = '150,156,168';

export function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: poseDetection.Pose | null,
  metrics: FrameMetrics,
  w: number,
  h: number,
  mirrored = false,
) {
  ctx.clearRect(0, 0, w, h);
  if (!pose || !pose.keypoints || !metrics.hasPose) return;

  const kp = new Map<string, Keypoint>();
  for (const p of pose.keypoints) {
    if (p.name && (p.score ?? 0) > 0.25) kp.set(p.name, p);
  }
  const nose = kp.get('nose');
  const ls = kp.get('left_shoulder');
  const rs = kp.get('right_shoulder');
  if (!nose || !ls || !rs) return;

  const faceDir = nose.x >= (ls.x + rs.x) / 2 ? 1 : -1;
  const la = kp.get('left_ankle');
  const ra = kp.get('right_ankle');
  const frontSide: Side = !la || !ra ? 'left' : (ra.x - la.x) * faceDir >= 0 ? 'right' : 'left';
  const backSide: Side = frontSide === 'left' ? 'right' : 'left';
  const side = (s: Side, j: string) => (s === 'left' ? 'left_' : 'right_') + j;
  const F = (j: string) => kp.get(side(frontSide, j));
  const B = (j: string) => kp.get(side(backSide, j));

  const torso = kp.get('left_hip') && kp.get('right_hip')
    ? Math.hypot((ls.x + rs.x) / 2 - ((kp.get('left_hip')!.x + kp.get('right_hip')!.x) / 2), (ls.y + rs.y) / 2 - ((kp.get('left_hip')!.y + kp.get('right_hip')!.y) / 2))
    : 60;

  const frontJoints = new Set([
    side(frontSide, 'hip'),
    side(frontSide, 'knee'),
    side(frontSide, 'ankle'),
    side(frontSide, 'shoulder'),
    side(frontSide, 'elbow'),
    side(frontSide, 'wrist'),
  ]);
  const backJoints = new Set([
    side(backSide, 'hip'),
    side(backSide, 'knee'),
    side(backSide, 'ankle'),
    side(backSide, 'shoulder'),
    side(backSide, 'elbow'),
    side(backSide, 'wrist'),
  ]);

  ctx.lineCap = 'round';

  for (const [a, b] of BONES) {
    const p1 = kp.get(a);
    const p2 = kp.get(b);
    if (!p1 || !p2) continue;
    const isFront = frontJoints.has(a) && frontJoints.has(b);
    const rgb = isFront ? BRASS : STEEL;
    const alpha = isFront ? 0.85 : 0.5;
    ctx.strokeStyle = `rgba(${rgb},${alpha})`;
    ctx.lineWidth = Math.max(2, torso / 22);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (const [name, p] of kp) {
    const isFront = frontJoints.has(name);
    const isBack = backJoints.has(name);
    if (!isFront && !isBack && name !== 'nose') continue;
    const rgb = isFront ? BRASS : STEEL;
    const r = isFront ? Math.max(3, torso / 26) : Math.max(2.2, torso / 34);
    if (isFront || name === 'nose') {
      ctx.shadowColor = `rgba(${BRASS},0.7)`;
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = `rgba(${rgb},0.95)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const stanceLine = metrics.phase === 'en_garde' || metrics.phase === 'lunging' || metrics.phase === 'recovering';
  if (stanceLine) {
    const fa = F('ankle');
    const ba = B('ankle');
    if (fa && ba) {
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = `rgba(${BRASS},0.4)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ba.x, ba.y);
      ctx.lineTo(fa.x, fa.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // The camera view is flipped with CSS scaleX(-1) when mirrored, which would render this
      // label backwards — draw it pre-flipped so it reads correctly on screen.
      ctx.font = `10px 'JetBrains Mono', ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(217,165,78,0.75)';
      ctx.save();
      ctx.translate((ba.x + fa.x) / 2, ba.y - 8);
      if (mirrored) ctx.scale(-1, 1);
      ctx.fillText(`stance ${metrics.stance.toFixed(2)}`, 0, 0);
      ctx.restore();
    }
  }

  const drawAngleArc = (joint: Keypoint | undefined, a: Keypoint | undefined, c: Keypoint | undefined, rgb: string, radius: number) => {
    if (!joint || !a || !c) return;
    const angA = Math.atan2(a.y - joint.y, a.x - joint.x);
    const angB = Math.atan2(c.y - joint.y, c.x - joint.x);
    let delta = angA - angB;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    ctx.strokeStyle = `rgba(${rgb},0.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joint.x, joint.y, radius, angB, angB + delta, delta < 0);
    ctx.stroke();
  };

  const fk = F('knee');
  const fhip = F('hip');
  const fa = F('ankle');
  drawAngleArc(fk, fhip, fa, BRASS, Math.max(16, torso / 3.2));

  const bk = B('knee');
  const bhip = B('hip');
  const ba = B('ankle');
  drawAngleArc(bk, bhip, ba, STEEL, Math.max(14, torso / 3.6));

  const sh = kp.get(side(frontSide, 'shoulder'));
  const hipMid = kp.get('left_hip') && kp.get('right_hip')
    ? { x: (kp.get('left_hip')!.x + kp.get('right_hip')!.x) / 2, y: (kp.get('left_hip')!.y + kp.get('right_hip')!.y) / 2 }
    : null;
  if (sh && hipMid) {
    ctx.strokeStyle = 'rgba(150,156,168,0.35)';
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(sh.x + (sh.y - hipMid.y) * 0.01 * -1, hipMid.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
