/**
 * Ring Overlay Engine
 * 
 * Handles rendering the ring image on the correct finger position
 * with proper scaling, rotation, and perspective
 */

import { getRingPosition, drawHandLandmarks } from './handTracking';

/**
 * Draw a ring image on the canvas at the detected finger position
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|HTMLCanvasElement} ringImage - the ring with transparent bg
 * @param {Object} ringPosition - from getRingPosition()
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {Object} controls - user adjustments { scale, rotation, offsetX, offsetY }
 */
export function drawRingOverlay(ctx, ringImage, ringPosition, canvasWidth, canvasHeight, controls = {}) {
  if (!ringPosition || !ringImage) return;

  const {
    scale = 1.0,
    rotation = 0,
    offsetX = 0,
    offsetY = 0,
    opacity = 1.0,
  } = controls;

  // Convert normalized coordinates to canvas pixels
  const px = ringPosition.x * canvasWidth + offsetX;
  const py = ringPosition.y * canvasHeight + offsetY;

  // Base ring size from finger width
  const fingerWidthPx = ringPosition.fingerWidth * canvasWidth;
  const baseSize = fingerWidthPx * 2.5; // ring should be wider than finger
  const ringWidth = baseSize * scale;
  const ringHeight = (ringWidth / ringImage.width) * ringImage.height;

  // Total rotation: finger angle + user adjustment
  const totalRotation = ringPosition.angle + (rotation * Math.PI / 180);

  ctx.save();
  ctx.globalAlpha = opacity;
  
  // Move to ring position
  ctx.translate(px, py);
  
  // Apply rotation to match finger angle
  ctx.rotate(totalRotation);
  
  // Slight perspective based on z-depth (if available)
  if (ringPosition.z) {
    const perspectiveScale = 1 + ringPosition.z * 0.5;
    ctx.scale(perspectiveScale, perspectiveScale);
  }

  // Draw ring centered on the position
  ctx.drawImage(
    ringImage,
    -ringWidth / 2,
    -ringHeight / 2,
    ringWidth,
    ringHeight
  );

  ctx.restore();
}

/**
 * Render the full try-on scene:
 * 1. Hand image as background
 * 2. Ring overlay on selected finger
 * 3. Optional debug landmarks
 */
export function renderTryOnScene(
  canvas,
  handImage,
  ringImage,
  landmarks,
  fingerName,
  controls,
  showLandmarks = false
) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Draw checkerboard background to show transparency
  drawCheckerboard(ctx, width, height);

  // Draw hand image
  if (handImage) {
    // Fit image to canvas maintaining aspect ratio
    const imgAspect = handImage.width / handImage.height;
    const canvasAspect = width / height;
    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > canvasAspect) {
      drawWidth = width;
      drawHeight = width / imgAspect;
      drawX = 0;
      drawY = (height - drawHeight) / 2;
    } else {
      drawHeight = height;
      drawWidth = height * imgAspect;
      drawX = (width - drawWidth) / 2;
      drawY = 0;
    }

    ctx.drawImage(handImage, drawX, drawY, drawWidth, drawHeight);
  }

  // Draw ring on detected finger
  if (landmarks && ringImage) {
    const ringPos = getRingPosition(landmarks, fingerName);
    if (ringPos) {
      drawRingOverlay(ctx, ringImage, ringPos, width, height, controls);
    }
  }

  // Draw landmarks for debugging
  if (showLandmarks && landmarks) {
    drawHandLandmarks(ctx, landmarks, width, height, {
      color: 'rgba(0, 255, 128, 0.7)',
      lineWidth: 1,
      dotSize: 3,
    });
  }
}

/**
 * Draw a subtle checkerboard pattern for transparent areas
 */
function drawCheckerboard(ctx, width, height, tileSize = 10) {
  const lightColor = '#f0f0f0';
  const darkColor = '#e0e0e0';
  
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const isLight = ((x / tileSize) + (y / tileSize)) % 2 === 0;
      ctx.fillStyle = isLight ? lightColor : darkColor;
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }
}

/**
 * Load an image from a URL or File and return an HTMLImageElement
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (src instanceof Blob || src instanceof File) {
      img.src = URL.createObjectURL(src);
    } else {
      img.src = src;
    }
  });
}
