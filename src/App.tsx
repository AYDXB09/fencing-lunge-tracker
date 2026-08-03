import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from './components/CameraView';
import {
  SessionSummary,
  ConsistencyChart,
  KeyMetrics,
  RecentLunges,
  PerformanceScore,
  QualityChart,
  Insights,
  Scrubber,
  Controls,
} from './components/Dashboard';
import type { LungeEvent, Phase, FrameMetrics } from './lib/LungeAnalyzer';
import { fmtClock } from './lib/session';

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
        <div className="leading-none">
          <div className="text-[15px] font-bold uppercase tracking-[0.08em] text-primary">Fencing</div>
          <div className="mono mt-0.5 text-[10px] uppercase tracking-[0.3em] text-muted">Lunge Tracker</div>
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

        <Controls onNewSession={newSession} onEndSession={endSession} />
      </header>

      {/* ------------------------------ dashboard ------------------------------ */}
      <main className="grid min-h-0 flex-1 grid-cols-12 gap-4 px-6 py-4">
        {/* left */}
        <aside className="col-span-3 flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          <SessionSummary events={history} />
          <ConsistencyChart events={history} elapsedSec={elapsed} />
          <KeyMetrics events={history} />
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
        </aside>
      </main>
    </div>
  );
}