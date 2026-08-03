import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { LungeAnalyzer, LungeEvent, FrameMetrics, Phase } from '../lib/LungeAnalyzer';
import { drawPose } from '../lib/drawPose';
import { Activity, RefreshCcw, ShieldAlert } from 'lucide-react';

interface CameraViewProps {
  mirrored: boolean;
  userHeightCm: number;
  resetFlag: number;
  onLunge: (e: LungeEvent) => void;
  onPhase: (p: Phase) => void;
}

export function CameraView({ mirrored, userHeightCm, resetFlag, onLunge, onPhase }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analyzerRef = useRef<LungeAnalyzer | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const requestRef = useRef(0);
  const frameRef = useRef(0);
  const dimsRef = useRef({ w: 0, h: 0 });

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stage, setStage] = useState('Loading AI pose model…');
  const [errorText, setErrorText] = useState('');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [telemetry, setTelemetry] = useState<FrameMetrics | null>(null);
  const [stageHint, setStageHint] = useState<'model' | 'none' | 'pose'>('model');

  useEffect(() => {
    analyzerRef.current = new LungeAnalyzer(onLunge, onPhase);
    return () => {
      analyzerRef.current = null;
    };
  }, [onLunge, onPhase]);

  useEffect(() => {
    analyzerRef.current?.setUserHeightCm(userHeightCm);
  }, [userHeightCm]);

  useEffect(() => {
    analyzerRef.current?.reset();
  }, [resetFlag]);

  useEffect(() => {
    let cancelled = false;
    init();

    async function init() {
      try {
        await tf.ready();
        detectorRef.current = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        });
        if (cancelled) {
          detectorRef.current?.dispose();
          return;
        }
        setModelLoaded(true);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          setStage('Ready.');
          setStatus('ready');
          setStageHint('none');
          requestRef.current = requestAnimationFrame(loop);
        };
      } catch (err) {
        console.error(err);
        setErrorText('Camera or model unavailable. Enable camera permission and reload to retry.');
        setStatus('error');
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(requestRef.current);
      const v = videoRef.current;
      if (v && v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
      detectorRef.current?.dispose();
      detectorRef.current = null;
    };
  }, []);

  const loop = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const analyzer = analyzerRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !analyzer || !detector || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(loop);
      return;
    }

    try {
      const poses = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });
      const metrics = analyzer.analyzeFrame(poses, performance.now());
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (dimsRef.current.w !== video.videoWidth || dimsRef.current.h !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          dimsRef.current = { w: video.videoWidth, h: video.videoHeight };
        }
        drawPose(ctx, poses[0] ?? null, metrics, canvas.width, canvas.height);
      }

      frameRef.current += 1;
      if (frameRef.current % 5 === 0) {
        setTelemetry(metrics);
        setStageHint(metrics.hasPose ? 'pose' : 'none');
      }
    } catch {
      // per-frame errors are ignored
    }

    requestRef.current = requestAnimationFrame(loop);
  };

  const retry = () => {
    setStatus('loading');
    setStage('Rebooting…');
    window.location.reload();
  };

  const overlayStroke = status === 'error' ? 'rgba(224,112,74,0.7)' : 'rgba(217,165,78,0.55)';

  return (
    <div className="relative">
      <div className="relative aspect-[4/3] md:aspect-video overflow-hidden rounded-[2px] border border-line bg-ink-950">
        <div className="absolute inset-0 pointer-events-none" />

        <div className="absolute inset-0" style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}>
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        </div>

        {/* corner brackets */}
        <div className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l border-t" style={{ borderColor: overlayStroke }} />
        <div className="pointer-events-none absolute right-3 top-3 h-5 w-5 border-r border-t" style={{ borderColor: overlayStroke }} />
        <div className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b border-l" style={{ borderColor: overlayStroke }} />
        <div className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b border-r" style={{ borderColor: overlayStroke }} />

        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-ink-950/85">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-brass-400 animate-pulse-glow" />
              <ShieldAlert className="h-6 w-6 text-brass-400" />
            </div>
            <div className="text-center">
              <p className="font-display text-lg italic text-steel-100">{stage}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.25em] text-steel-500">
                {modelLoaded ? 'switching to camera' : 'warming up moveNet'}
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-ink-950/90 px-8 text-center">
            <ShieldAlert className="h-8 w-8 text-ember-400" />
            <p className="max-w-sm text-sm text-steel-300">{errorText}</p>
            <button
              onClick={retry}
              className="mt-1 inline-flex items-center gap-2 rounded-[2px] border border-line bg-ink-800 px-4 py-2 text-sm text-steel-100 transition-colors hover:border-brass-400/50 hover:text-brass-300"
            >
              <RefreshCcw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && stageHint === 'none' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-[2px] border border-line bg-ink-950 px-4 py-2 text-center">
              <p className="text-xs text-steel-300">Step into frame — full body, head to toe</p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-ember-500 opacity-60 animate-pulse-glow" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ember-400" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-steel-300">Cam</span>
        </div>

      </div>

      <TelemetryStrip metrics={telemetry} />
    </div>
  );
}

function gaugeColor(pct: number, goodAtPct: number) {
  return pct >= goodAtPct ? 'bg-leaf-400' : pct >= goodAtPct * 0.6 ? 'bg-brass-400' : 'bg-ember-400';
}

function Gauge({
  label,
  value,
  max,
  unit,
  goodAt,
  format,
}: {
  label: string;
  value: number | null;
  max: number;
  unit: string;
  goodAt: number;
  format: (v: number) => string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-steel-500">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-steel-200">
          {value === null ? '–' : `${format(value)}${unit}`}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-ink-800">
        <div
          className="h-full rounded-[2px] animate-meter transition-colors"
          style={{ width: `${pct}%`, backgroundColor: gaugeColor(pct, (goodAt / max) * 100), transitionProperty: 'width, background-color' }}
        />
      </div>
    </div>
  );
}

function TelemetryStrip({ metrics }: { metrics: FrameMetrics | null }) {
  return (
    <div className="u-card px-4 py-3">
      <div className="flex items-center justify-between pb-2.5">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-steel-500">
          <Activity className="h-3.5 w-3.5 text-brass-400" />
          Live telemetry
        </span>
        <span className="font-mono text-[10px] text-steel-600">≈5 Hz</span>
      </div>
      {!metrics || !metrics.hasPose ? (
        <p className="font-mono text-[11px] tracking-wide text-steel-600">waiting for a full-body pose…</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 lg:grid-cols-5">
          <Gauge label="Stance" value={metrics.stance} max={3} unit="T" goodAt={1.4} format={(v) => v.toFixed(2)} />
          <Gauge label="Weapon arm" value={metrics.frontArmAngle} max={180} unit="°" goodAt={150} format={(v) => v.toFixed(0)} />
          <Gauge label="Back leg" value={metrics.backLegAngle} max={180} unit="°" goodAt={162} format={(v) => v.toFixed(0)} />
          <Gauge label="Front knee" value={metrics.frontKneeAngle} max={180} unit="°" goodAt={100} format={(v) => v.toFixed(0)} />
          <Gauge label="Hip speed" value={metrics.hipSpeed} max={3} unit=" T/s" goodAt={1.5} format={(v) => (v > 0.1 ? v.toFixed(2) : '0.00')} />
        </div>
      )}
    </div>
  );
}