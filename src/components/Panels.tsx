import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Wrench, History as HistoryIcon, Swords } from 'lucide-react';
import type { LungeEvent, Phase } from '../lib/LungeAnalyzer';
import { cn } from '../utils/cn';

export function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    prev.current = to;
    if (from === to) {
      setVal(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function Stat({
  label,
  value,
  unit,
  sub,
  accent = 'brass',
  display,
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  accent?: 'brass' | 'leaf' | 'ember' | 'steel';
  display?: (v: number) => string;
}) {
  const animated = useCountUp(value);
  const palette: Record<string, string> = {
    brass: 'text-brass-300',
    leaf: 'text-leaf-400',
    ember: 'text-ember-400',
    steel: 'text-steel-100',
  };
  return (
    <div className="u-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-steel-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn('font-display text-3xl font-light tabular-nums', palette[accent])}>
          {(display ? display(animated) : String(animated)).toString()}
        </span>
        {unit && <span className="font-mono text-[11px] text-steel-500">{unit}</span>}
      </div>
      {sub && <p className="mt-1 font-mono text-[10px] text-steel-600">{sub}</p>}
    </div>
  );
}

const scoreColor = (s: number) => (s >= 80 ? '#e0704a' : s >= 55 ? '#d9a54e' : '#8e939e');

export function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(217,165,78,0.12)" strokeWidth="7" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={scoreColor(pct)}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-light tabular-nums text-steel-100">{pct}</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-steel-500">Form</span>
      </div>
    </div>
  );
}

function Cue({ type }: { type: string }) {
  if (type === 'good') return <Check className="h-4 w-4 text-leaf-400" />;
  if (type === 'info') return <Wrench className="h-4 w-4 text-brass-300" />;
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <X className="h-4 w-4 text-ember-400" />
    </span>
  );
}

export function FeedbackPanel({ event }: { event?: LungeEvent | null }) {
  return (
    <div className="u-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-steel-400">
          <Check className="h-4 w-4 text-brass-400" />
          Technique
        </h3>
        {event && <ScoreRing score={event.score} />}
      </div>

      <div className="mt-4">
        {!event ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <HistoryIcon className="h-7 w-7 text-steel-600" />
            <p className="text-xs leading-relaxed text-steel-500">
              Complete a lunge to receive live
              <br />
              technique cues and a form score.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 animate-ticker">
            {event.feedbacks.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-3 rounded-[2px] border border-line bg-ink-950 px-3 py-2.5"
              >
                <div className="mt-0.5">
                  <Cue type={f.type} />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-[13px] leading-snug',
                      f.type === 'bad' ? 'text-ember-400' : f.type === 'info' ? 'text-brass-300' : f.type === 'good' ? 'text-leaf-400' : 'text-steel-200',
                    )}
                  >
                    {f.message}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-600">{f.cue}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function HistoryPanel({ events }: { events: LungeEvent[] }) {
  const latest = events.length > 0 ? events[0].speedMs ?? events[0].speed : 0;
  const fast = events.length > 1 ? Math.max(...events.map((e) => e.speedMs ?? e.speed)) : latest;
  const unit = events.some((e) => e.speedMs !== null) ? 'm/s' : 'T/s';

  return (
    <div className="u-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-steel-500">
          <Swords className="h-4 w-4 text-brass-400" />
          Session log
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-wide text-steel-600">
          best <span className="text-brass-300">{fast.toFixed(2)}</span> {unit}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-center">
          <p className="text-xs text-steel-600">No lunges logged yet.</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {events.slice(0, 8).map((e, i) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-[2px] px-2 py-1.5 transition-colors hover:bg-ink-800/50"
            >
              <span className="w-5 font-mono text-[10px] text-steel-600">#{events.length - i}</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: scoreColor(e.score) }} />
              <span className="font-mono text-[11px] tabular-nums text-steel-200">
                {(e.speedMs ?? e.speed).toFixed(2)} <span className="text-steel-600">{unit}</span>
              </span>
              <span className="font-mono text-[10px] text-steel-500">{(e.durationMs / 1000).toFixed(2)}s</span>
              <div className="ml-auto flex gap-1">
                {e.feedbacks.slice(0, 5).map((f) => (
                  <span
                    key={f.id}
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: f.passed ? '#57a878' : '#cf5a33' }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PhaseChip({ phase }: { phase: Phase }) {
  const map: Record<Phase, { label: string; lamp: string; text: string; ring: string }> = {
    idle: { label: 'Idle', lamp: 'bg-steel-500', text: 'text-steel-400', ring: 'border-line' },
    en_garde: { label: 'En garde', lamp: 'bg-brass-400', text: 'text-brass-300', ring: 'border-brass-400/40' },
    lunging: { label: 'Lunge', lamp: 'bg-leaf-400', text: 'text-leaf-400', ring: 'border-leaf-400/40' },
    recovering: { label: 'Recover', lamp: 'bg-steel-300', text: 'text-steel-200', ring: 'border-steel-400/40' },
  };
  const m = map[phase];
  return (
    <div className={cn('flex items-center gap-2.5 rounded-[2px] border bg-ink-900 px-3.5 py-1.5', m.ring)}>
      <span className="relative flex h-2 w-2">
        <span className={cn('absolute inline-flex h-full w-full animate-pulse-glow rounded-full opacity-70', m.lamp)} />
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', m.lamp)} />
      </span>
      <span className={cn('font-mono text-[10px] uppercase tracking-[0.24em]', m.text)}>{m.label}</span>
    </div>
  );
}