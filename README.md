# Lunge Lab — Épée Technique Analyzer

A real-time computer-vision lunge tracker for fencing épée. It watches you from your webcam,
detects every lunge, measures the speed of each one (and your session average), and coaches
your technique with specific, actionable cues — all running on-device in the browser.

## What it does

- **Lunge detection** — a state machine on top of MoveNet pose keypoints that distinguishes a
  real lunge from a walking step or fidget. En garde is locked in with hysteresis so it does
  not flicker while you hold position.
- **Speed & distance** — lunge speed is measured as body (hip) translation over the extension
  phase, reported in torso-lengths/second and, if you enter your height, estimated m/s.
- **Technique feedback** — each lunge is scored /100 and broken into cues, including:
  - weapon arm extension timing (arm leads the foot),
  - back leg full extension,
  - back-arm counterbalance (the "second arm should go back" cue),
  - torso lean,
  - front-foot height (the "leg is too high" cue),
  - front knee over the heel,
  - front knee bend depth.
- **Live telemetry** — stance width, weapon-arm angle, back-leg angle, front-knee angle and
  hip speed are drawn in real time alongside a mirrored skeleton overlay with joint-angle arcs.

## Stack

- React 19 + TypeScript + Vite (single-file production build via `vite-plugin-singlefile`)
- Tailwind CSS v4 with a custom atelier-style design system (Fraunces / Instrument Sans / IBM Plex Mono)
- MoveNet Thunder (`@tensorflow-models/pose-detection`) with WebGL backend — all inference is
  local; no video leaves the browser.

## Run it

```bash
npm install
npm run dev       # local dev server
npm run build     # production single-file build -> dist/index.html
npm run preview   # preview the build
```

## Verify the detection engine

A synthetic-pose harness exercises the state machine without a camera: two clean lunges, a
walking step that must be rejected, and a 1.5 s en-garde hold that must not flicker.

```bash
npm run test:sim
```

## How to use

1. Step back so your whole body (head to toe) is in frame.
2. Enter **en garde** — the chip in the header turns gold when you're locked in.
3. Lunge, hold the extension, then recover.
4. Read your score, speed and technique cues in the panel.

## Notes

- Works best with a side/three-quarter view in good light.
- Enter your height in the header to get speed in m/s; otherwise speeds are reported in
  torso-lengths/second, which is pose-agnostic.
- Camera feed and skeleton are mirrored by default for a natural selfie view; toggle the mirror
  button in the header if you prefer otherwise.
