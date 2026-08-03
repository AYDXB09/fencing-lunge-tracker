import type { LungeEvent, FeedbackItem } from './LungeAnalyzer';

export type ResultBand = 'touch' | 'noTouch' | 'invalid';

export const RESULT_BAND: Record<ResultBand, { label: string; color: string; bg: string }> = {
  touch: { label: 'Touch', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  noTouch: { label: 'No Touch', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  invalid: { label: 'Invalid', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

export function classify(score: number): ResultBand {
  if (score >= 75) return 'touch';
  if (score >= 50) return 'noTouch';
  return 'invalid';
}

export function speedOf(e: LungeEvent): number | null {
  if (e.speedMs !== null && e.speedMs > 0) return e.speedMs;
  if (e.speed > 0 && isFinite(e.speed)) return e.speed;
  return null;
}

export function lengthOf(e: LungeEvent): { value: number; unit: string } {
  if (e.speedMs !== null && e.speedMs > 0) {
    return { value: (e.speedMs * e.durationMs) / 1000, unit: 'm' };
  }
  return { value: e.hipTravel, unit: 'T' };
}

export function extensionOf(e: LungeEvent): number {
  return Math.max(0, Math.min(100, Math.round((e.backLegAngle / 165) * 100)));
}

export interface SkillScore {
  label: string;
  value: number;
  color: string;
}

const CUE_BUCKETS: Record<string, RegExp[]> = {
  Extension: [/arm/i, /extend/i, /reach/i, /knee/i, /deep/i],
  Balance: [/torso/i, /lean/i, /back arm/i, /foot low/i, /foot/i, /heel/i],
  Recovery: [/sweep/i, /counterbalance/i, /recover/i, /balance/i],
};

function passRate(items: FeedbackItem[], regexes: RegExp[]): number | null {
  const hits = items.filter((f) => regexes.some((r) => r.test(f.cue)));
  if (hits.length === 0) return null;
  return (hits.filter((f) => f.passed).length / hits.length) * 100;
}

export function skills(events: LungeEvent[]): SkillScore[] {
  const all: FeedbackItem[] = events.flatMap((e) => e.feedbacks);
  const base: SkillScore[] = [
    { label: 'Extension', value: 0, color: '#22c55e' },
    { label: 'Balance', value: 0, color: '#2563eb' },
    { label: 'Speed', value: 0, color: '#a855f7' },
    { label: 'Form', value: 0, color: '#f59e0b' },
    { label: 'Recovery', value: 0, color: '#22d3ee' },
  ];

  const ext = passRate(all, CUE_BUCKETS.Extension);
  const bal = passRate(all, CUE_BUCKETS.Balance);
  const rec = passRate(all, CUE_BUCKETS.Recovery);

  const speeds = events.map(speedOf).filter((s): s is number => s !== null);
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const speedPct = Math.min(100, (avgSpeed / 3) * 100);

  const form = events.length ? events.reduce((a, e) => a + e.score, 0) / events.length : 0;

  if (ext !== null) base[0].value = Math.round(ext);
  if (bal !== null) base[1].value = Math.round(bal);
  base[2].value = Math.round(speedPct);
  base[3].value = Math.round(form);
  if (rec !== null) base[4].value = Math.round(rec);
  else if (bal !== null) base[4].value = Math.round(bal);

  return base;
}

export function sessionSummary(events: LungeEvent[]) {
  const total = events.length;
  const valid = events.filter((e) => classify(e.score) !== 'invalid').length;
  const validPct = total ? Math.round((valid / total) * 100) : 0;
  const touches = events.filter((e) => classify(e.score) === 'touch').length;
  const touchPct = total ? Math.round((touches / total) * 100) : 0;
  return { total, valid, validPct, attacks: total, touches, touchPct };
}

export function fmtTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function smoothY(values: number[], window = 3): number[] {
  if (values.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(values.length, i + window + 1);
    const slice = values.slice(lo, hi);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}
