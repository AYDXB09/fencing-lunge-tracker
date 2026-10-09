import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { LungeAnalyzer, LungeEvent, FrameMetrics, Phase } from '../lib/LungeAnalyzer';
import { drawPose } from '../lib/drawPose';
import { RefreshCcw, ShieldAlert } from 'lucide-react';

interface CameraViewProps {
  mirrored: boolean;
  userHeightCm: number;
  resetFlag: number;
  onLunge: (e: LungeEvent) => void;
  onPhase: (p: Phase) => void;
  onFrame?: (m: FrameMetrics) => void;
}

export function CameraView({ mirrored, userHeightCm, resetFlag, onLunge, onPhase, onFrame }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analyzerRef = useRef<LungeAnalyzer | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const requestRef = useRef(0);
  const frameRef = useRef(0);
  const dimsRef = useRef({ w: 0, h: 0 });

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stage, setStage] = useState('Loading pose model…');
  const [errorText, setErrorText] = useState('');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');

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
        drawPose(ctx, poses[0] ?? null, metrics, canvas.width, canvas.height, mirrored);
      }

      frameRef.current += 1;
      if (frameRef.current % 3 === 0) {
        setLive(metrics.hasPose);
        setPhase(metrics.phase);
        onFrame?.(metrics);
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070a10]">
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div
        className="absolute inset-0"
        style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      </div>

      {/* frame + corners */}
      <div className="pointer-events-none absolute inset-0 rounded-none ring-1 ring-inset ring-white/5" />
      <div className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-cyan-400/70" />
      <div className="pointer-events-none absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-cyan-400/70" />
      <div className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-cyan-400/70" />
      <div className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-cyan-400/70" />

      {/* live cam tag */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md border border-line bg-surface/80 px-2.5 py-1">
        <span
          className={`h-2 w-2 rounded-full ${live ? 'bg-success animate-live-pulse' : 'bg-warn animate-grain'}`}
        />
        <span className="mono text-[10px] uppercase tracking-[0.25em] text-muted">
          {live ? 'tracking' : phase === 'idle' ? 'no pose' : phase}
        </span>
      </div>

      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg/85">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-accent animate-grain" />
            <ShieldAlert className="h-6 w-6 text-accent-bright" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold tracking-tight text-primary">{stage}</p>
            <p className="mono mt-1 text-[10px] uppercase tracking-[0.25em] text-dim">
              {modelLoaded ? 'switching to camera' : 'warming up pose model'}
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg/90 px-8 text-center">
          <ShieldAlert className="h-8 w-8 text-danger" />
          <p className="max-w-sm text-sm text-muted">{errorText}</p>
          <button
            onClick={retry}
            className="mt-1 inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-accent/60 hover:text-accent-bright"
          >
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && !live && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-lg border border-line bg-surface/85 px-4 py-2 text-center">
            <p className="text-xs text-muted">Step into frame — full body, head to toe</p>
          </div>
        </div>
      )}
    </div>
  );
}
