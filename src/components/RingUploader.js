import React, { useCallback, useRef, useState, useEffect } from 'react';
import { detectRing, checkAlignment } from '../utils/ringDetection';
import './RingUploader.css';

// Overlay guide is centered at (50%, 50%) and ~30% of frame width radius
const GUIDE = { cx: 0.5, cy: 0.5, radius: 0.15 };

/**
 * Ring image capture component — opens a camera to photograph the ring
 * with a semi-transparent overlay guide for alignment.
 * Includes real-time ring detection to show alignment status.
 */
export default function RingUploader({ onImageSelected, currentImage }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectLoopRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [alignment, setAlignment] = useState(null); // { aligned, hint, detection }

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (detectLoopRef.current) cancelAnimationFrame(detectLoopRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setCameraReady(false);

    // Check browser support — mediaDevices requires HTTPS on mobile
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera not available. Please use HTTPS or localhost.');
      return;
    }

    // Show the viewfinder UI first so the <video> element is in the DOM
    setIsCameraOpen(true);
  }, []);

  // Once the viewfinder UI is shown (and the video element exists), attach the stream
  useEffect(() => {
    if (!isCameraOpen) return;

    let cancelled = false;

    (async () => {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch {
          // Fallback: any available camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            if (!cancelled) {
              video.play().then(() => {
                setCameraReady(true);
              }).catch(() => {});
            }
          };
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Camera error:', err);
          setCameraError(err.message || 'Could not access camera');
          setIsCameraOpen(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCameraOpen]);

  // Real-time ring detection loop while camera is active
  useEffect(() => {
    if (!cameraReady || !isCameraOpen) {
      setAlignment(null);
      return;
    }

    let running = true;
    const video = videoRef.current;

    const loop = () => {
      if (!running || !video || video.readyState < 2) {
        detectLoopRef.current = requestAnimationFrame(loop);
        return;
      }

      const detection = detectRing(video);
      const result = checkAlignment(detection, GUIDE);
      setAlignment({ ...result, detection });

      // Throttle to ~10 fps (detection is expensive)
      setTimeout(() => {
        if (running) detectLoopRef.current = requestAnimationFrame(loop);
      }, 100);
    };

    detectLoopRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (detectLoopRef.current) cancelAnimationFrame(detectLoopRef.current);
    };
  }, [cameraReady, isCameraOpen]);

  const stopCamera = useCallback(() => {
    if (detectLoopRef.current) {
      cancelAnimationFrame(detectLoopRef.current);
      detectLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setCameraReady(false);
    setCountdown(null);
    setAlignment(null);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to image
    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      onImageSelected(img, 'Captured Ring');
      stopCamera();
    };
    img.src = dataUrl;
  }, [onImageSelected, stopCamera]);

  const handleCaptureClick = useCallback(() => {
    // 3-second countdown before capture
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        capturePhoto();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [capturePhoto]);

  return (
    <div className="ring-uploader">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {!isCameraOpen ? (
        <>
          {/* Show captured preview or prompt to open camera */}
          {currentImage ? (
            <div className="captured-preview">
              <img src={currentImage.src} alt="Captured ring" className="ring-preview-img" />
              <div className="captured-actions">
                <button className="retake-btn" onClick={startCamera}>
                  📷 Retake
                </button>
              </div>
            </div>
          ) : (
            <button className="open-camera-btn" onClick={startCamera}>
              <span className="cam-icon">📷</span>
              <span className="cam-label">Capture Ring Image</span>
              <span className="cam-hint">Open camera to photograph your ring</span>
            </button>
          )}

          {cameraError && (
            <div className="camera-error">⚠ {cameraError}</div>
          )}
        </>
      ) : (
        /* Camera viewfinder */
        <div className="camera-viewfinder">
          {/* Video element — always present when viewfinder is open */}
          <video ref={videoRef} playsInline autoPlay muted className="camera-feed" />

          {/* Loading spinner while camera initializes */}
          {!cameraReady && (
            <div className="camera-loading">
              <span className="loading-spinner">⏳</span>
              <span>Starting camera...</span>
            </div>
          )}

          {/* Ring overlay guide — colored by alignment */}
          <div className={`ring-guide-circle ${alignment ? (alignment.aligned ? 'guide-aligned' : 'guide-misaligned') : ''}`} />

          {/* Ring overlay image guide at 60% opacity */}
          <img
            src="/rings/ring-overlay.png"
            alt=""
            className="ring-guide-overlay"
          />

          {/* Detected ring outline (when detected) */}
          {alignment?.detection?.detected && (
            <div
              className={`detected-ring-outline ${alignment.aligned ? 'outline-aligned' : 'outline-misaligned'}`}
              style={{
                left: `${alignment.detection.cx * 100}%`,
                top: `${alignment.detection.cy * 100}%`,
                width: `${alignment.detection.radius * 200}%`,
                height: `${alignment.detection.radius * 200}%`,
              }}
            />
          )}

          {/* Alignment status banner */}
          {cameraReady && alignment && (
            <div className={`alignment-banner ${alignment.aligned ? 'banner-aligned' : 'banner-misaligned'}`}>
              <span className="alignment-icon">{alignment.aligned ? '✅' : '⚠️'}</span>
              <span className="alignment-text">{alignment.hint}</span>
            </div>
          )}

          {/* Countdown overlay */}
          {countdown !== null && (
            <div className="countdown-overlay">
              <span className="countdown-number">{countdown}</span>
            </div>
          )}

          {/* Camera controls */}
          <div className="viewfinder-controls">
            <button className="vf-btn cancel" onClick={stopCamera}>
              ✕ Cancel
            </button>
            <button
              className="vf-btn capture"
              onClick={handleCaptureClick}
              disabled={countdown !== null || !cameraReady}
            >
              {countdown !== null ? `${countdown}...` : '◉ Capture'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
