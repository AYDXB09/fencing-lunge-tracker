import { LungeAnalyzer, type LungeEvent, type Phase } from '../src/lib/LungeAnalyzer';

type J = { name: string; x: number; y: number; score: number };
const kp = (name: string, x: number, y: number, score = 0.95): J => ({ name, x, y, score });

const enGarde: J[] = [
  kp('nose', 430, 200),
  kp('left_eye', 424, 196),
  kp('right_eye', 436, 196),
  kp('left_ear', 418, 203),
  kp('right_ear', 442, 203),
  kp('left_shoulder', 300, 262),
  kp('right_shoulder', 362, 262),
  kp('left_elbow', 306, 322),
  kp('right_elbow', 402, 306),
  kp('left_wrist', 292, 350),
  kp('right_wrist', 440, 332),
  kp('left_hip', 302, 332),
  kp('right_hip', 358, 332),
  kp('left_knee', 326, 404),
  kp('right_knee', 388, 396),
  kp('left_ankle', 300, 456),
  kp('right_ankle', 386, 456),
];

const lungePeak: J[] = [
  kp('nose', 470, 215),
  kp('left_eye', 464, 211),
  kp('right_eye', 476, 211),
  kp('left_ear', 458, 218),
  kp('right_ear', 482, 218),
  kp('left_shoulder', 340, 270),
  kp('right_shoulder', 406, 268),
  kp('left_elbow', 352, 332),
  kp('right_elbow', 448, 300),
  kp('left_wrist', 258, 352),
  kp('right_wrist', 488, 326),
  kp('left_hip', 336, 342),
  kp('right_hip', 388, 330),
  kp('left_knee', 316, 395),
  kp('right_knee', 443, 332),
  kp('left_ankle', 302, 456),
  kp('right_ankle', 443, 456),
];

const stepAhead: J[] = [
  kp('nose', 452, 202),
  kp('left_eye', 446, 198),
  kp('right_eye', 458, 198),
  kp('left_ear', 440, 205),
  kp('right_ear', 464, 205),
  kp('left_shoulder', 322, 264),
  kp('right_shoulder', 384, 264),
  kp('left_elbow', 328, 324),
  kp('right_elbow', 424, 308),
  kp('left_wrist', 314, 352),
  kp('right_wrist', 462, 334),
  kp('left_hip', 324, 334),
  kp('right_hip', 380, 334),
  kp('left_knee', 348, 406),
  kp('right_knee', 410, 398),
  kp('left_ankle', 322, 456),
  kp('right_ankle', 408, 456),
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const joints = (from: J[], to: J[], t: number): J[] =>
  from.map((j, i) => ({ ...j, x: lerp(j.x, to[i].x, t), y: lerp(j.y, to[i].y, t) }));

function feed(a: LungeAnalyzer, p: J[], t: number): number {
  a.analyzeFrame([{ keypoints: p, score: 1 }], t);
  return t + 33;
}

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// real camera noise: positional jitter + occasional non-critical joint dips + rare blank frames
const CRITICAL = new Set([
  'nose',
  'left_ankle',
  'right_ankle',
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
]);
function jit(p: J[], amp: number, dip: number, r: () => number): J[] {
  const out = p.map((j) => {
    let score = j.score;
    if (!CRITICAL.has(j.name as string)) score = r() < dip ? 0.12 : score;
    return {
      ...j,
      x: j.x + (r() - 0.5) * 2 * amp,
      y: j.y + (r() - 0.5) * 2 * amp,
      score,
    };
  });
  if (r() < 0.04) return out.map((j) => ({ ...j, score: 0.05 }));
  return out;
}

function cleanLunges({ noisy = false } = {}): number {
  const r = rng(12347);
  const evs: LungeEvent[] = [];
  const phases: Phase[] = [];
  let last: Phase | null = null;
  const a = new LungeAnalyzer(
    (e) => evs.push(e),
    (p) => {
      if (p !== last) {
        phases.push(p);
        last = p;
      }
    },
  );
  a.setUserHeightCm(175);
  let t = 0;
  const hold = (p: J[], n: number) => {
    for (let i = 0; i < n; i++) t = feed(a, noisy ? jit(p, 0.04, 0.12, r) : p, t);
  };
  const move = (from: J[], to: J[], n: number) => {
    for (let i = 0; i <= n; i++) t = feed(a, noisy ? jit(joints(from, to, i / n), 0.04, 0.12, r) : joints(from, to, i / n), t);
  };
  hold(enGarde, 12);
  move(enGarde, lungePeak, 6);
  hold(lungePeak, 12);
  move(lungePeak, enGarde, 8);
  hold(enGarde, 16);
  move(enGarde, lungePeak, 6);
  hold(lungePeak, 12);
  move(lungePeak, enGarde, 8);
  hold(enGarde, 12);

  console.log(`\n=== clean lunge x2 ${noisy ? '(WITH noise & dropped frames)' : '(clean)'} ===`);
  console.log('phases:', phases.join(' -> '));
  evs.forEach((e, i) =>
    console.log(
      `  #${i + 1} dur=${e.durationMs}ms hip=${e.hipTravel.toFixed(2)}T stance=${e.peakStance.toFixed(2)} ` +
        `backLeg=${e.backLegAngle.toFixed(0)} frontKnee=${e.frontKneeAngle.toFixed(0)} arm=${e.armTimingMs} ` +
        `speed=${e.speed.toFixed(2)}T/s speedMs=${e.speedMs?.toFixed(2) ?? 'n/a'} score=${e.score} ` +
        `bad=${e.feedbacks.filter((f) => f.type === 'bad').length}`,
    ),
  );
  return evs.length;
}

function walkStep(): number {
  const evs: LungeEvent[] = [];
  const phases: Phase[] = [];
  let last: Phase | null = null;
  const a = new LungeAnalyzer(
    (e) => evs.push(e),
    (p) => {
      if (p !== last) {
        phases.push(p);
        last = p;
      }
    },
  );
  let t = 0;
  const hold = (p: J[], n: number) => {
    for (let i = 0; i < n; i++) t = feed(a, p, t);
  };
  hold(enGarde, 10);
  for (let i = 0; i <= 5; i++) t = feed(a, joints(enGarde, stepAhead, i / 5), t);
  hold(stepAhead, 20);
  for (let i = 0; i <= 5; i++) t = feed(a, joints(stepAhead, enGarde, i / 5), t);
  hold(enGarde, 10);
  console.log('\n=== walking step (should NOT count) ===');
  console.log('phases:', phases.join(' -> '), '| events:', evs.length);
  return evs.length;
}

function holdsEnGarde(): boolean {
  let saw = false;
  let lost = false;
  let last: Phase | null = null;
  const a = new LungeAnalyzer(
    () => {},
    (p) => {
      if (p !== last) {
        last = p;
        if (p === 'en_garde') saw = true;
        if (saw && p !== 'en_garde') lost = true;
      }
    },
  );
  let t = 0;
  for (let i = 0; i < 45; i++) t = feed(a, enGarde, t); // hold ~1.5s
  console.log('\n=== holds en garde 1.5s without flicker ===');
  console.log(saw && !lost ? 'PASS stays en_garde' : `FAIL saw=${saw} lost=${lost}`);
  return saw && !lost;
}

const c1 = cleanLunges();
const c1n = cleanLunges({ noisy: true });
const c2 = walkStep();
const c3 = holdsEnGarde();
console.log(`\nRESULT  clean=${c1} noisy=${c1n} (expect 2) walkStep=${c2} (expect 0) hold=${c3} (expect true)`);
console.log(c1 >= 2 && c1n >= 2 && c2 === 0 && c3 ? '\nALL PASS' : '\nSOMETHING FAILED');