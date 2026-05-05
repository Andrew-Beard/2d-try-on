import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createHandLandmarker, detectForVideo, resetHandLandmarker, getRingPosition, drawHandLandmarks, isHandClosed, computeHandVelocity } from '../utils/handTracking';
import { drawRingOverlay } from '../utils/ringOverlay';
import './TryOnCanvas.css';

/**
 * Main try-on canvas - shows webcam feed with ring overlay tracked to finger
 */
export default function TryOnCanvas({ ringImage, controls, onPalmClosed }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const handsRef = useRef(null);
  const runningRef = useRef(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Click "Start Camera" to begin');
  const [isPalmClosed, setIsPalmClosed] = useState(false);
  const landmarksRef = useRef(null);
  // Enhanced tracking state
  const smoothedLandmarksRef = useRef(null); // EMA-smoothed landmark positions
  const isPalmClosedRef = useRef(false);      // ref copy for render loop (no stale closure)
  const frozenRingPosRef = useRef(null);      // last good ring position when palm open
  const targetRingPosRef = useRef(null);      // latest computed ring pos (detection rate)
  const displayRingPosRef = useRef(null);     // interpolated ring pos (render rate, 60fps)
  const velocityRef = useRef(0);              // wrist velocity for adaptive smoothing
  const handednessRef = useRef('Right');      // 'Left' | 'Right' — latest detected handedness

  // Store controls in a ref so the render loop always reads latest
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  // Store ring image in a ref
  const ringImageRef = useRef(ringImage);
  useEffect(() => {
    ringImageRef.current = ringImage;
  }, [ringImage]);

  const startWebcam = useCallback(async () => {
    try {
      // Check browser support — mediaDevices requires HTTPS on mobile
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMessage('Camera not available. Please use HTTPS or localhost.');
        return;
      }

      setStatusMessage('Starting camera...');
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      }

      const video = videoRef.current;
      video.srcObject = stream;

      // Wait for video metadata then play
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });
      await video.play();

      setStatusMessage('Loading hand detection model...');
      
      // Initialize HandLandmarker (tasks-vision API)
      const handLandmarker = await createHandLandmarker();
      handsRef.current = handLandmarker;

      setIsWebcamActive(true);
      setStatusMessage('Show your hand to the camera');

      // Start detection loop — runs every animation frame for minimum latency
      runningRef.current = true;
      const detectLoop = () => {
        if (!runningRef.current || !handsRef.current) return;

        if (video.readyState >= 2) {
          const { landmarks, handedness } = detectForVideo(handsRef.current, video, performance.now());
          if (landmarks) {
            // MediaPipe reports from the camera mirror perspective; flip to match mirrored video
            if (handedness?.[0]?.categoryName) {
              handednessRef.current = handedness[0].categoryName === 'Left' ? 'Right' : 'Left';
            }
            const prev = smoothedLandmarksRef.current;

            // Velocity for adaptive alpha — how fast is the wrist moving?
            const velocity = computeHandVelocity(prev, landmarks);
            velocityRef.current = velocity;

            // Higher base alpha = less lag. Ramp up smoothly with speed.
            // 0.6 at rest → 0.92 at fast movement. No predictive look-ahead (causes jumps).
            const alpha = Math.min(0.92, 0.6 + velocity * 18);

            smoothedLandmarksRef.current = prev
              ? landmarks.map((lm, i) => ({
                  x: alpha * lm.x + (1 - alpha) * prev[i].x,
                  y: alpha * lm.y + (1 - alpha) * prev[i].y,
                  z: alpha * lm.z + (1 - alpha) * prev[i].z,
                }))
              : landmarks.slice();

            // Compute ring target position from smoothed landmarks
            const ctrl = controlsRef.current;
            const mirrored = smoothedLandmarksRef.current.map(lm => ({ ...lm, x: 1 - lm.x }));
            const ringPos = getRingPosition(mirrored, ctrl.finger);
            if (ringPos) targetRingPosRef.current = ringPos;

            // Palm close detection — use raw landmarks for gesture accuracy
            const closed = isHandClosed(landmarks);
            isPalmClosedRef.current = closed;
            setIsPalmClosed(closed);
            if (onPalmClosed) onPalmClosed(closed);

            landmarksRef.current = landmarks;
            setHandDetected(true);
          } else {
            landmarksRef.current = null;
            smoothedLandmarksRef.current = null;
            targetRingPosRef.current = null;
            velocityRef.current = 0;
            isPalmClosedRef.current = false;
            setIsPalmClosed(false);
            if (onPalmClosed) onPalmClosed(false);
            setHandDetected(false);
          }
        }

        requestAnimationFrame(detectLoop);
      };

      requestAnimationFrame(detectLoop);
      
    } catch (err) {
      console.error('Webcam error:', err);
      setStatusMessage(`Camera error: ${err.message}`);
    }
  }, []);

  const stopWebcam = useCallback(() => {
    runningRef.current = false;

    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
      resetHandLandmarker();
    }
    landmarksRef.current = null;
    smoothedLandmarksRef.current = null;
    frozenRingPosRef.current = null;
    targetRingPosRef.current = null;
    displayRingPosRef.current = null;
    velocityRef.current = 0;
    isPalmClosedRef.current = false;
    setIsPalmClosed(false);
    setIsWebcamActive(false);
    setHandDetected(false);
    setStatusMessage('Camera stopped');
  }, []);

  // Render loop - draws video + ring overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let renderFrame;

    const render = () => {
      const video = videoRef.current;
      const ctrl = controlsRef.current;
      const ring = ringImageRef.current;
      const landmarks = landmarksRef.current;

      if (video && video.readyState >= 2 && isWebcamActive) {
        // Size canvas to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame (mirrored)
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.restore();

        // 60fps render-rate interpolation of ring position toward detection target
        // This makes the ring glide smoothly even between detection frames
        const target = targetRingPosRef.current;
        if (target) {
          const display = displayRingPosRef.current;
          if (!display) {
            displayRingPosRef.current = { ...target };
          } else {
            // Lerp speed: 0.35 at rest, ramp up to 0.85 when moving fast
            const vel = velocityRef.current;
            const lerpT = Math.min(0.85, 0.35 + vel * 20);
            displayRingPosRef.current = {
              ...target,
              x: display.x + (target.x - display.x) * lerpT,
              y: display.y + (target.y - display.y) * lerpT,
              angle: display.angle + (target.angle - display.angle) * lerpT,
              fingerWidth: display.fingerWidth + (target.fingerWidth - display.fingerWidth) * 0.15,
            };
          }
        }

        // Draw ring overlay using smoothed + predicted landmarks
        const smoothedLandmarks = smoothedLandmarksRef.current;
        if (smoothedLandmarks && ring) {
          // Update frozen position when palm is open
          if (!isPalmClosedRef.current && displayRingPosRef.current) {
            frozenRingPosRef.current = displayRingPosRef.current;
          }

          // Hide ring entirely when palm is closed
          const posToRender = isPalmClosedRef.current ? null : displayRingPosRef.current;
          if (posToRender) {
            const offsetX = handednessRef.current === 'Left'
              ? (ctrl.offsetXLeft ?? 0)
              : (ctrl.offsetXRight ?? 0);
            drawRingOverlay(ctx, ring, posToRender, canvas.width, canvas.height, {
              scale: ctrl.scale,
              rotation: ctrl.rotation,
              offsetX,
              offsetY: ctrl.offsetY,
              opacity: ctrl.opacity,
            });
          }
        }

        // Draw landmarks if enabled (use smoothed for visual consistency)
        if (ctrl.showLandmarks && smoothedLandmarks) {
          const mirroredLandmarks = smoothedLandmarks.map(lm => ({
            ...lm,
            x: 1 - lm.x,
          }));
          drawHandLandmarks(ctx, mirroredLandmarks, canvas.width, canvas.height, {
            color: 'rgba(0, 255, 128, 0.7)',
            lineWidth: 2,
            dotSize: 4,
          });
        }
      } else if (!isWebcamActive) {
        // Draw placeholder
        canvas.width = 640;
        canvas.height = 480;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#555';
        ctx.font = '16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(statusMessage, canvas.width / 2, canvas.height / 2);
      }

      renderFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(renderFrame);
  }, [isWebcamActive, statusMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopWebcam();
  }, [stopWebcam]);

  return (
    <div className="tryon-canvas-container">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} className="tryon-canvas" />
        <video ref={videoRef} style={{ display: 'none' }} playsInline autoPlay muted />
        
        {/* Status overlay */}
        <div className="status-bar">
          <span className={`status-dot ${isWebcamActive ? (handDetected ? 'detected' : 'active') : 'inactive'}`} />
          <span className="status-text">
            {isWebcamActive 
              ? (handDetected 
                  ? `${isPalmClosed ? '✊ Ring frozen' : '✋ Hand detected'} · ${controls.finger} finger`
                  : 'Waiting for hand...')
              : 'Camera off'}
          </span>
          {isPalmClosed && isWebcamActive && (
            <span className="status-frozen">Open hand to adjust</span>
          )}
          {!ringImage && isWebcamActive && (
            <span className="status-warning">⚠ No ring loaded</span>
          )}
        </div>
      </div>

      <div className="camera-controls">
        {!isWebcamActive ? (
          <button className="cam-btn start" onClick={startWebcam}>
            📷 Start Camera
          </button>
        ) : (
          <button className="cam-btn stop" onClick={stopWebcam}>
            ⏹ Stop Camera
          </button>
        )}
      </div>
    </div>
  );
}
