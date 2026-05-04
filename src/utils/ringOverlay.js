/**
 * Ring Overlay Engine
 * 
 * Handles rendering the ring image on the correct finger position
 * with proper scaling, rotation, and perspective
 */

import { getRingPosition, drawHandLandmarks } from './handTracking';

let reflectionCanvas = null;
let reflectionCtx = null;

function ensureReflectionCanvas(width, height) {
  const safeWidth = Math.max(1, Math.ceil(width));
  const safeHeight = Math.max(1, Math.ceil(height));

  if (!reflectionCanvas) {
    reflectionCanvas = document.createElement('canvas');
    reflectionCtx = reflectionCanvas.getContext('2d');
  }

  if (reflectionCanvas.width !== safeWidth || reflectionCanvas.height !== safeHeight) {
    reflectionCanvas.width = safeWidth;
    reflectionCanvas.height = safeHeight;
  }

  reflectionCtx.clearRect(0, 0, reflectionCanvas.width, reflectionCanvas.height);
  return { canvas: reflectionCanvas, ctx: reflectionCtx };
}

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
    rotation = -95,
    offsetX = 0,
    offsetY = 0,
    opacity = 1.0,
  } = controls;

  // Convert normalized coordinates to canvas pixels
  const px = ringPosition.x * canvasWidth + offsetX;
  const py = ringPosition.y * canvasHeight + offsetY;

  // Base ring size from finger width
  const fingerWidthPx = ringPosition.fingerWidth * canvasWidth;
  const baseSize = fingerWidthPx * 1.65;
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

  // Realtime reflection layer (specular highlights clipped to ring alpha only)
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.002;
  const shimmer = Math.sin(now + ringPosition.x * 8 + ringPosition.y * 6);
  const reflectionStrength = Math.max(0.15, Math.min(0.9, 0.55 - (ringPosition.z || 0) * 0.8));
  const sweepOffset = shimmer * ringWidth * 0.22;

  const layer = ensureReflectionCanvas(ringWidth, ringHeight);
  const layerCanvas = layer.canvas;
  const layerCtx = layer.ctx;

  const sweepGradient = layerCtx.createLinearGradient(
    sweepOffset,
    0,
    layerCanvas.width + sweepOffset,
    layerCanvas.height
  );
  sweepGradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.00)');
  sweepGradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.04)');
  sweepGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.32)');
  sweepGradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.06)');
  sweepGradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.00)');

  layerCtx.globalCompositeOperation = 'source-over';
  layerCtx.globalAlpha = reflectionStrength;
  layerCtx.fillStyle = sweepGradient;
  layerCtx.fillRect(0, 0, layerCanvas.width, layerCanvas.height);

  const hotspotX = layerCanvas.width * (0.35 + shimmer * 0.12);
  const hotspotY = layerCanvas.height * 0.3;
  const hotspot = layerCtx.createRadialGradient(
    hotspotX,
    hotspotY,
    layerCanvas.width * 0.04,
    hotspotX,
    hotspotY,
    layerCanvas.width * 0.38
  );
  hotspot.addColorStop(0.0, 'rgba(255, 255, 255, 0.26)');
  hotspot.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
  hotspot.addColorStop(1.0, 'rgba(255, 255, 255, 0.00)');

  layerCtx.globalAlpha = reflectionStrength * 0.8;
  layerCtx.fillStyle = hotspot;
  layerCtx.fillRect(0, 0, layerCanvas.width, layerCanvas.height);

  // Mask reflection with ring alpha so highlights never appear on transparent background
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.globalAlpha = 1;
  layerCtx.drawImage(ringImage, 0, 0, layerCanvas.width, layerCanvas.height);

  // Composite masked reflection over ring
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = opacity;
  ctx.drawImage(layerCanvas, -ringWidth / 2, -ringHeight / 2, ringWidth, ringHeight);
  ctx.restore();

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
