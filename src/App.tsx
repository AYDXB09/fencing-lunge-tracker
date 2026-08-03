import { useCallback, useMemo, useState } from 'react';
import { CameraView } from './components/CameraView';
import { Stat, FeedbackPanel, HistoryPanel, PhaseChip } from './components/Panels';
import type { LungeEvent, Phase } from './lib/LungeAnalyzer';
import { FlipHorizontal2, RotateCcw, Crosshair } from 'lucide-react';
import { cn } from './utils/cn';

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function EpeeMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="15" stroke="var(--color-brass-500)" strokeOpacity="0.35" />
      <path d="M16 4 L16 12" stroke="var(--color-brass-400)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="3" r="1.1" fill="var(--color-brass-300)" />
      <path d="M16 12 L11 15 M16 12 L21 15 M11 15 H21" stroke="var(--color-brass-400)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 15 V28" stroke="var(--color-brass-400)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="28" r="1.4" fill="var(--color-brass-300)" />
    </svg>
  );
}

function Step({ n, label }: { n: string; label: string }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[11px] text-steel-400">
      <span className="grid h-4 w-4 place-items-center rounded-full border border-brass-400/40 font-mono text-[9px] text-brass-300">
        {n}
      </span>
      {label}
    </span>
  );
}

export default function App() {
  const [history, setHistory] = useState<LungeEvent[]>([]);
  const [last, setLast] = useState<LungeEvent | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [mirrored, setMirrored] = useState(true);
  const [heightCm, setHeightCm] = useState(175);
  const [resetFlag, setResetFlag] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLunge = useCallback((e: LungeEvent) => {
    setLast(e);
    setHistory((prev) => [e, ...prev].slice(0, 24));
  }, []);

  const handlePhase = useCallback((p: Phase) => setPhase(p), []);

  const stats = useMemo(() => {
    const speedsMs = history.map((e) => e.speedMs).filter((x): x is number => x !== null && x > 0);
    const speedsT = history.map((e) => e.speed).filter((x) => x > 0 && isFinite(x));
    const useMs = speedsMs.length > 0;
    const speeds = useMs ? speedsMs : speedsT;
    const avg = mean(speeds);
    const best = speeds.length ? Math.max(...speeds) : 0;
    const form = mean(history.map((e) => e.score));
    return { avg, best, form, useMs, count: history.length };
  }, [history]);

  const reset = () => {
    setHistory([]);
    setLast(null);
    setResetFlag((n) => n + 1);
  };

  return (
    <div className="grain min-h-screen bg-piste text-steel-100">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink-950">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <EpeeMark />
            <div className="leading-none">
              <div className="font-display text-lg font-light italic tracking-tight text-steel-100">Épée Lunge Tracker</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.42em] text-brass-500">form · speed · footwork</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <PhaseChip phase={phase} />

            <button
              onClick={() => setMirrored((m) => !m)}
              title="Mirror the camera view"
              className={cn(
                'grid h-9 w-9 place-items-center rounded-[2px] border transition-colors',
                mirrored ? 'border-brass-400/50 text-brass-300' : 'border-line text-steel-500 hover:text-steel-300',
              )}
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </button>

            <button
              onClick={() => setSettingsOpen((o) => !o)}
              title="Body height for speed estimation"
              className={cn(
                'flex h-9 items-center gap-2 rounded-[2px] border px-3 font-mono text-[11px] tracking-wide transition-colors',
                settingsOpen ? 'border-brass-400/50 text-brass-300' : 'border-line text-steel-400 hover:text-steel-200',
              )}
            >
              <Crosshair className="h-4 w-4" />
              {heightCm} cm
            </button>

            <button
              onClick={reset}
              title="Reset session"
              className="flex h-9 items-center gap-2 rounded-[2px] border border-line px-3 font-mono text-[11px] uppercase tracking-wider text-steel-400 transition-colors hover:border-ember-400/50 hover:text-ember-400"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div className="border-t border-line-soft bg-ink-900">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-steel-500">Your height</span>
                <input
                  type="range"
                  min="140"
                  max="220"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="h-1 w-48 accent-[#d9a54e]"
                />
                <span className="w-14 font-mono text-sm tabular-nums text-steel-100">{heightCm} cm</span>
              </div>
              <p className="max-w-sm font-mono text-[11px] leading-relaxed text-steel-600">
                Scales pixel distance to metres so lunge speed and travel are reported in real-world units.
              </p>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7">
        {stats.count === 0 && last === null && (
          <div className="mb-5 flex items-center justify-center">
            <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 rounded-[2px] border border-line bg-ink-900 px-6 py-2.5">
              <Step n="01" label="find en garde" />
              <span className="text-steel-700">·</span>
              <Step n="02" label="lunge & hold" />
              <span className="text-steel-700">·</span>
              <Step n="03" label="recover" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="u-card p-3">
              <CameraView
                mirrored={mirrored}
                userHeightCm={heightCm}
                resetFlag={resetFlag}
                onLunge={handleLunge}
                onPhase={handlePhase}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <Stat
                label="Avg lunge speed"
                value={stats.avg}
                unit={stats.useMs ? 'm/s' : 'T/s'}
                accent="brass"
                display={(v) => v.toFixed(2)}
                sub={stats.useMs ? 'estimated from body height' : 'torso-lengths / second'}
              />
              <Stat
                label="Fastest"
                value={stats.best}
                unit={stats.useMs ? 'm/s' : 'T/s'}
                accent="leaf"
                display={(v) => v.toFixed(2)}
                sub={stats.count > 0 ? `${stats.count} lunge${stats.count === 1 ? '' : 's'} this session` : 'no lunges yet'}
              />
            </div>
          </div>

          <aside className="space-y-5 lg:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Lunges" value={stats.count} accent="steel" />
              <Stat label="Avg form" value={stats.form} unit="/100" accent="leaf" display={(v) => v.toFixed(0)} />
            </div>

            <FeedbackPanel event={last} />
            <HistoryPanel events={history} />
          </aside>
        </div>

        <footer className="mt-10 border-t border-line-soft pt-6 pb-8 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-steel-600">Épée lunge tracker</p>
        </footer>
      </main>
    </div>
  );
}