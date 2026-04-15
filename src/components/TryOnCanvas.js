import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createHandLandmarker, detectForVideo, resetHandLandmarker, getRingPosition, drawHandLandmarks } from '../utils/handTracking';
import { drawRingOverlay } from '../utils/ringOverlay';
import './TryOnCanvas.css';

/**
 * Main try-on canvas - shows webcam feed with ring overlay tracked to finger
 */
export default function TryOnCanvas({ ringImage, controls }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const handsRef = useRef(null);
  const runningRef = useRef(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Click "Start Camera" to begin');
  const landmarksRef = useRef(null);

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

      // Start detection loop — synchronous detectForVideo per frame
      runningRef.current = true;
      const detectLoop = () => {
        if (!runningRef.current || !handsRef.current) return;

        if (video.readyState >= 2) {
          const { landmarks } = detectForVideo(handsRef.current, video, performance.now());
          if (landmarks) {
            landmarksRef.current = landmarks;
            setHandDetected(true);
          } else {
            landmarksRef.current = null;
            setHandDetected(false);
          }
        }

        // ~30 fps detection throttle
        setTimeout(() => requestAnimationFrame(detectLoop), 33);
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

        // Draw ring overlay if hand detected
        if (landmarks && ring) {
          // Mirror the landmarks since video is mirrored
          const mirroredLandmarks = landmarks.map(lm => ({
            ...lm,
            x: 1 - lm.x,
          }));
          
          const ringPos = getRingPosition(mirroredLandmarks, ctrl.finger);
          if (ringPos) {
            drawRingOverlay(ctx, ring, ringPos, canvas.width, canvas.height, {
              scale: ctrl.scale,
              rotation: ctrl.rotation,
              offsetX: ctrl.offsetX,
              offsetY: ctrl.offsetY,
              opacity: ctrl.opacity,
            });
          }
        }

        // Draw landmarks if enabled
        if (ctrl.showLandmarks && landmarks) {
          const mirroredLandmarks = landmarks.map(lm => ({
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
              ? (handDetected ? `Hand detected · ${controls.finger} finger` : 'Waiting for hand...')
              : 'Camera off'}
          </span>
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
