import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from './components/CameraView';
import {
  SessionSummary,
  ConsistencyChart,
  KeyMetrics,
  WeaponSelect,
  RecentLunges,
  PerformanceScore,
  QualityChart,
  Insights,
  Scrubber,
  Controls,
} from './components/Dashboard';
import type { LungeEvent, Phase, FrameMetrics } from './lib/LungeAnalyzer';
import { fmtClock } from './lib/session';
import { Bluetooth } from 'lucide-react';

function FencerMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="19" stroke="#2563eb" strokeOpacity="0.35" />
      {/* head */}
      <circle cx="24" cy="9" r="2.2" fill="#fff" />
      {/* arm out toward target (extended forward) */}
      <path d="M24 12 L31 8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      {/* weapon */}
      <path d="M31 8 L37 5" stroke="#22c55e" strokeWidth="1.2" strokeLinecap="round" />
      {/* torso leaning into lunge */}
      <path d="M22 13 L18 21" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      {/* front leg bent forward */}
      <path d="M18 21 L21 25 M21 25 L19 33" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      {/* back leg extended behind */}
      <path d="M18 21 L9 23 M9 23 L7 33" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [history, setHistory] = useState<LungeEvent[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [heightCm] = useState(175);
  const [resetFlag, setResetFlag] = useState(0);
  const [live, setLive] = useState(false);
  const [running, setRunning] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      if (running) setElapsedSec((Date.now() - startRef.current) / 1000);
    }, 500);
    return () => clearInterval(id);
  }, [running]);

  const handleLunge = useCallback((e: LungeEvent) => {
    setHistory((prev) => [e, ...prev].slice(0, 200));
  }, []);

  const handlePhase = useCallback((p: Phase) => setPhase(p), []);
  const handleFrame = useCallback((m: FrameMetrics) => setLive(m.hasPose), []);

  const newSession = () => {
    startRef.current = Date.now();
    setElapsedSec(0);
    setHistory([]);
    setRunning(true);
    setResetFlag((n) => n + 1);
  };

  const endSession = () => {
    setRunning(false);
    setHistory([]);
  };

  const avgScore = useMemo(() => {
    if (!history.length) return 0;
    return history.reduce((a, e) => a + e.score, 0) / history.length;
  }, [history]);

  const elapsed = Math.floor(elapsedSec);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-primary">
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6">
        <div className="flex items-center gap-3">
          <FencerMark />
          <div className="leading-none">
            <div className="text-[15px] font-bold uppercase tracking-[0.08em] text-primary">Fencing</div>
            <div className="mono mt-0.5 text-[10px] uppercase tracking-[0.3em] text-muted">Lunge Tracker</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5">
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-success animate-live-pulse' : 'bg-dim'}`} />
            <span className="mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Live Session</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5">
            <span className="mono text-[12px] font-semibold tabular-nums text-primary">{fmtClock(elapsed)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5">
            <Bluetooth className="h-4 w-4 text-accent-bright" />
            <span className="mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Connected</span>
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-live-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-none">
              <div className="text-[13px] font-semibold text-primary">Anvith Y.</div>
              <div className="mono mt-0.5 text-[9px] uppercase tracking-[0.2em] text-muted">Épée Fencer</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[13px] font-bold text-white">
              AY
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------ dashboard ------------------------------ */}
      <main className="grid min-h-0 flex-1 grid-cols-12 gap-4 px-6 py-4">
        {/* left */}
        <aside className="col-span-3 flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          <SessionSummary events={history} />
          <ConsistencyChart events={history} elapsedSec={elapsed} />
          <KeyMetrics events={history} />
          <WeaponSelect />
        </aside>

        {/* center */}
        <section className="col-span-5 flex min-h-0 flex-col gap-4">
          <div className="card shrink-0 overflow-hidden">
            <div className="relative h-[320px] lg:h-[360px]">
              <CameraView
                mirrored
                userHeightCm={heightCm}
                resetFlag={resetFlag}
                onLunge={handleLunge}
                onPhase={handlePhase}
                onFrame={handleFrame}
              />
            </div>
            <div className="px-3 pb-3 pt-1">
              <Scrubber events={history} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <RecentLunges events={history} sessionStartMs={startRef.current} />
          </div>

          <div className="flex shrink-0 items-center gap-3 px-1 text-[10px] text-dim">
            <span className="flex items-center gap-1.5">
              <span className="mono uppercase tracking-[0.14em]">Phase</span>
              <span className="font-semibold capitalize text-primary">{phase.replace('_', ' ')}</span>
            </span>
            <span className="mono ml-auto tabular-nums">overall {avgScore.toFixed(0)}/100</span>
          </div>
        </section>

        {/* right */}
        <aside className="col-span-4 flex min-h-0 flex-col gap-4 overflow-y-auto pl-1">
          <PerformanceScore events={history} />
          <QualityChart events={history} elapsedSec={elapsed} />
          <Insights events={history} />
          <div className="mt-auto">
            <Controls onNewSession={newSession} onEndSession={endSession} />
          </div>
        </aside>
      </main>
    </div>
  );
}