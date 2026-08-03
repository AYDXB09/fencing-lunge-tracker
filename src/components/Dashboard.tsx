import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Swords,
  Ruler,
  Timer,
  Crosshair,
  Gauge,
  RefreshCcw,
  ChevronDown,
  Info,
  Play,
  Square,
  RotateCcw,
  TrendingUp,
  ArrowUpRight,
  Footprints,
} from 'lucide-react';
import type { LungeEvent } from '../lib/LungeAnalyzer';
import {
  classify,
  RESULT_BAND,
  speedOf,
  lengthOf,
  extensionOf,
  skills,
  sessionSummary,
  fmtTime,
  fmtClock,
  smoothY,
  type SkillScore,
} from '../lib/session';
import { cn } from '../utils/cn';

/* ---------------------------------- primitives ---------------------------------- */

function Card({
  title,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn('card', className)}>
      {title && (
        <header className="flex items-center justify-between px-4 pt-3.5 pb-1">
          <h3 className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</h3>
          {right}
        </header>
      )}
      <div className={cn('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

function Tile({
  label,
  value,
  accent,
  badge,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  badge?: { text: string; color: string };
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="mono text-[9px] font-medium uppercase tracking-[0.16em] text-dim">{label}</span>
        {icon && <span className="text-accent-bright">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: accent ?? '#fff' }}>
          {value}
        </span>
        {badge && (
          <span
            className="mono ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ color: badge.color, backgroundColor: `${badge.color}1f` }}
          >
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- session summary ---------------------------------- */

export function SessionSummary({ events }: { events: LungeEvent[] }) {
  const s = sessionSummary(events);
  return (
    <Card title="Session Summary">
      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="Total Lunges" value={s.total} />
        <Tile
          label="Valid Lunges"
          value={s.valid}
          accent="#22c55e"
          badge={{ text: `${s.validPct}%`, color: '#22c55e' }}
        />
        <Tile label="Attacks" value={s.attacks} icon={<Swords className="h-4 w-4" />} />
        <Tile
          label="Touches"
          value={s.touches}
          accent="#f59e0b"
          badge={{ text: `${s.touchPct}%`, color: '#f59e0b' }}
        />
      </div>
    </Card>
  );
}

/* ---------------------------------- consistency chart ---------------------------------- */

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function TimeAxis({ elapsedSec }: { elapsedSec: number }) {
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-0">
      {ticks.map((t, i) => (
        <span key={i} className="mono text-[9px] text-dim">
          {fmtTime(elapsedSec * t)}
        </span>
      ))}
    </div>
  );
}

export function ConsistencyChart({
  events,
  elapsedSec,
}: {
  events: LungeEvent[];
  elapsedSec: number;
}) {
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const grid = [0, 25, 50, 75, 100];

  let pts: { x: number; y: number }[] = [];
  if (ordered.length >= 2) {
    const scores = smoothY(ordered.map((ev) => ev.score));
    ordered.forEach((_ev, i) => {
      const x = 6 + (scores.length <= 1 ? 0 : (i / (scores.length - 1)) * 86);
      const y = 94 - (scores[i] / 100) * 88;
      pts.push({ x, y });
    });
  }
  const line = smoothPath(pts);
  const area = line ? `${line} L 92 94 L 6 94 Z` : '';

  return (
    <Card title="Lunge Consistency" right={<Info className="h-3.5 w-3.5 text-dim" />} bodyClass="pt-2">
      <div className="relative h-40">
        <div className="absolute inset-y-0 left-0 right-8">
          {grid.map((g) => (
            <div
              key={g}
              className="absolute inset-x-0 border-t border-dashed border-line/60"
              style={{ bottom: `${g}%` }}
            />
          ))}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 94" preserveAspectRatio="none">
            <defs>
              <linearGradient id="consFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#consFill)" />}
            {line && (
              <path
                d={line}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
                style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.7))' }}
              />
            )}
          </svg>
          {pts.map((p, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.04 }}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-bright"
              style={{ left: `${p.x}%`, top: `${(p.y / 94) * 100}%`, boxShadow: '0 0 6px rgba(59,130,246,0.8)' }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-8 flex-col justify-between py-px">
          {grid.map((g) => (
            <span key={g} className="mono text-right text-[9px] leading-none text-dim">
              {g}%
            </span>
          ))}
        </div>
        <TimeAxis elapsedSec={elapsedSec} />
        {ordered.length < 2 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <p className="rounded-md border border-line bg-surface/80 px-3 py-1.5 text-xs text-muted">
              Complete lunges to build the trend
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------- key metrics ---------------------------------- */

export function KeyMetrics({ events }: { events: LungeEvent[] }) {
  const n = events.length;
  const lens = events.map(lengthOf);
  const lengths = lens.filter((l) => l.value > 0);
  const useM = lens.some((l) => l.unit === 'm');
  const avgLen = lengths.length ? lengths.reduce((a, l) => a + l.value, 0) / lengths.length : 0;
  const avgTime = n ? events.reduce((a, e) => a + e.durationMs, 0) / n / 1000 : 0;
  const avgExt = n ? events.reduce((a, e) => a + extensionOf(e), 0) / n : 0;
  const speeds = events.map(speedOf).filter((s): s is number => s !== null);
  const useMs = events.some((e) => e.speedMs !== null);
  const avgSpeed = speeds.length ? speeds.reduce((a, s) => a + s, 0) / speeds.length : 0;

  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    gaps.push((ordered[i].ts - ordered[i - 1].ts - ordered[i - 1].durationMs) / 1000);
  }
  const recTime = gaps.length ? Math.max(0, gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

  const rows = [
    { label: 'Average Lunge Length', icon: <Ruler className="h-4 w-4" />, color: '#3b82f6', value: avgLen.toFixed(2), unit: useM ? 'm' : 'T' },
    { label: 'Average Lunge Time', icon: <Timer className="h-4 w-4" />, color: '#3b82f6', value: avgTime.toFixed(2), unit: 's' },
    { label: 'Average Extension', icon: <Crosshair className="h-4 w-4" />, color: '#f59e0b', value: avgExt.toFixed(0), unit: '%' },
    { label: 'Average Speed', icon: <Gauge className="h-4 w-4" />, color: '#22c55e', value: avgSpeed.toFixed(2), unit: useMs ? 'm/s' : 'T/s' },
    { label: 'Recovery Time', icon: <RefreshCcw className="h-4 w-4" />, color: '#a855f7', value: recTime.toFixed(2), unit: 's' },
  ];

  return (
    <Card title="Key Metrics">
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-2"
          >
            <span className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface-2" style={{ color: r.color }}>
              {r.icon}
            </span>
            <span className="text-[12.5px] text-primary">{r.label}</span>
            <span className="mono ml-auto text-[13px] font-semibold tabular-nums text-primary">
              {r.value}
              <span className="ml-1 text-[10px] font-normal text-dim">{r.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------- controls ---------------------------------- */

function ResultBadge({ score }: { score: number }) {
  const band = RESULT_BAND[classify(score)];
  return (
    <span
      className="mono rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: band.color, backgroundColor: band.bg }}
    >
      {band.label}
    </span>
  );
}

export function RecentLunges({ events, sessionStartMs }: { events: LungeEvent[]; sessionStartMs: number }) {
  const rows = events.slice(0, 6);
  return (
    <Card
      title="Recent Lunges"
      right={<span className="mono text-[10px] text-dim">{events.length} recorded</span>}
      bodyClass="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              {['#', 'TIME', 'TYPE', 'LENGTH', 'TIME', 'EXT', 'SPEED', 'RESULT'].map((h) => (
                <th key={h} className="mono px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted">
                  No lunges logged yet.
                </td>
              </tr>
            )}
            {rows.map((e, i) => {
              const len = lengthOf(e);
              const ext = extensionOf(e);
              const sp = speedOf(e);
              return (
                <tr key={e.id} className="border-b border-line-soft last:border-0 hover:bg-surface-2/60">
                  <td className="mono px-3 py-2 text-[11px] tabular-nums text-dim">{events.length - i}</td>
                  <td className="mono px-3 py-2 text-[11px] tabular-nums text-muted">
                    {fmtClock(Math.max(0, (e.ts - sessionStartMs) / 1000))}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-primary">
                      <Swords className="h-3 w-3 text-accent-bright" />
                      Attack
                    </span>
                  </td>
                  <td className="mono px-3 py-2 text-[11px] tabular-nums text-muted">
                    {len.value.toFixed(2)}
                    <span className="ml-0.5 text-[9px] text-dim">{len.unit}</span>
                  </td>
                  <td className="mono px-3 py-2 text-[11px] tabular-nums text-muted">{(e.durationMs / 1000).toFixed(2)}s</td>
                  <td className="mono px-3 py-2 text-[11px] tabular-nums text-muted">{ext}%</td>
                  <td className="mono px-3 py-2 text-[11px] tabular-nums text-muted">
                    {sp !== null ? sp.toFixed(2) : '–'}
                  </td>
                  <td className="px-3 py-2">
                    <ResultBadge score={e.score} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="mono flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-bright transition-colors hover:bg-surface-2">
        View All Lunges
        <ChevronDown className="h-3 w-3 -rotate-90" />
      </button>
    </Card>
  );
}

/* ---------------------------------- performance score ---------------------------------- */

function SkillBar({ s, delay }: { s: SkillScore; delay: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted">{s.label}</span>
        <span className="mono text-[11px] font-semibold tabular-nums" style={{ color: s.color }}>
          {s.value}%
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: s.color }}
          initial={{ width: 0 }}
          animate={{ width: `${s.value}%` }}
          transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export function PerformanceScore({ events }: { events: LungeEvent[] }) {
  const score = events.length ? Math.round(events.reduce((a, e) => a + e.score, 0) / events.length) : 0;
  const sk = skills(events);
  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <Card title="Performance Score" right={<Info className="h-3.5 w-3.5 text-dim" />}>
      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#202836" strokeWidth="9" />
            <motion.circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="#22c55e"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: c - (score / 100) * c }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              style={{ filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.6))' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular-nums tracking-tight text-primary">{score}</span>
            <span className="mono text-[9px] uppercase tracking-[0.2em] text-dim">/100</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {sk.map((s, i) => (
            <SkillBar key={s.label} s={s} delay={0.2 + i * 0.08} />
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------- quality scatter ---------------------------------- */

export function QualityChart({ events, elapsedSec }: { events: LungeEvent[]; elapsedSec: number }) {
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const grid = [0, 25, 50, 75, 100];
  const x = (e: LungeEvent) => (ordered.length <= 1 ? 50 : 4 + (ordered.indexOf(e) / (ordered.length - 1)) * 88);

  return (
    <Card title="Lunge Quality Over Time" bodyClass="pt-2">
      <div className="relative h-36">
        <div className="absolute inset-y-0 left-0 right-7">
          {grid.map((g) => (
            <div
              key={g}
              className="absolute inset-x-0 border-t border-dashed border-line/60"
              style={{ bottom: `${g}%` }}
            />
          ))}
          {ordered.map((e, i) => {
            const band = RESULT_BAND[classify(e.score)];
            return (
              <motion.span
                key={e.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                title={`${e.score} — ${band.label}`}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${x(e)}%`, top: `${94 - (e.score / 100) * 88}%`, backgroundColor: band.color }}
              />
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-7 flex-col justify-between py-px">
          {grid.map((g) => (
            <span key={g} className="mono text-right text-[9px] leading-none text-dim">
              {g}
            </span>
          ))}
        </div>
        <TimeAxis elapsedSec={elapsedSec} />
        {ordered.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <p className="rounded-md border border-line bg-surface/80 px-3 py-1.5 text-xs text-muted">Awaiting data</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-4 border-t border-line-soft pt-2.5">
        <LegendDot color="#22c55e" label="Good" />
        <LegendDot color="#f59e0b" label="Average" />
        <LegendDot color="#ef4444" label="Poor" />
      </div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/* ---------------------------------- insights ---------------------------------- */

export function Insights({ events }: { events: LungeEvent[] }) {
  const n = events.length;
  const empty = (
    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line bg-surface-2/40">
      <p className="text-xs text-dim">No insights yet — complete a few lunges</p>
    </div>
  );
  if (n === 0) {
    return (
      <Card title="Insights">
        {empty}
      </Card>
    );
  }

  const avgExt = events.reduce((a, e) => a + extensionOf(e), 0) / n;
  const rec = skills(events)[4].value;
  const items: { icon: React.ReactNode; color: string; title: string; sub: string }[] = [];

  if (avgExt >= 85) {
    items.push({
      icon: <ArrowUpRight className="h-3.5 w-3.5" />,
      color: '#22c55e',
      title: 'Great extension!',
      sub: 'Excellent full arm extension through the lunge.',
    });
  }
  if (rec > 0 && rec < 85) {
    items.push({
      icon: <Footprints className="h-3.5 w-3.5" />,
      color: '#2563eb',
      title: 'Work on recovery time',
      sub: 'Try to recover your back foot a bit faster.',
    });
  }
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  if (ordered.length >= 3) {
    const half = Math.floor(ordered.length / 2);
    const a = ordered.slice(0, half).map(speedOf).filter((s): s is number => s !== null);
    const b = ordered.slice(half).map(speedOf).filter((s): s is number => s !== null);
    const ma = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const mb = b.length ? b.reduce((x, y) => x + y, 0) / b.length : 0;
    if (ma > 0 && mb > ma * 1.02) {
      items.push({
        icon: <TrendingUp className="h-3.5 w-3.5" />,
        color: '#a855f7',
        title: 'Speed is improving',
        sub: `Average speed up ${Math.round((mb / ma - 1) * 100)}% this session.`,
      });
    }
  }

  return (
    <Card title="Insights">
      {items.length === 0 ? (
        empty
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3"
            >
              <span
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                style={{ backgroundColor: it.color }}
              >
                {it.icon}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-primary">{it.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{it.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------- scrubber ---------------------------------- */

export function Scrubber({ events }: { events: LungeEvent[] }) {
  const [playing, setPlaying] = useState(false);
  const dots = events.slice(-48).map((e) => classify(e.score));

  return (
    <div className="mt-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-3">
        <LegendDot color="#22c55e" label="Valid Lunge" />
        <LegendDot color="#f59e0b" label="No Touch" />
        <LegendDot color="#ef4444" label="Invalid" />
        <span className="mono ml-auto text-[10px] tabular-nums text-dim">{events.length} lunges</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={dots.length === 0}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Square className="h-3 w-3 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
        </button>
        <div className="relative flex h-2 flex-1 items-center overflow-hidden rounded-full bg-surface">
          {dots.length === 0 ? (
            <span className="mono absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-[0.18em] text-dim">
              No lunges yet
            </span>
          ) : (
            dots.map((k, i) => (
              <span
                key={i}
                className="animate-dot h-2 flex-1"
                style={{ backgroundColor: RESULT_BAND[k].color, opacity: i < dots.length ? 1 : 0.18 }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- controls ---------------------------------- */

export function Controls({
  onNewSession,
  onEndSession,
}: {
  onNewSession: () => void;
  onEndSession: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onNewSession}
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-muted transition-colors hover:border-accent/50 hover:text-primary"
      >
        <RotateCcw className="h-4 w-4" />
        New Session
      </button>
      <button
        onClick={onEndSession}
        className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-semibold text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-colors hover:bg-accent-bright"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
        End Session
      </button>
    </div>
  );
}
