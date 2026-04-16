/**
 * Ring Detection Module — canvas-based ring/circle detection for camera alignment.
 *
 * Strategy:
 *   1. Downscale frame for speed
 *   2. Convert to grayscale
 *   3. Gaussian blur to reduce noise
 *   4. Sobel edge detection
 *   5. Threshold edges
 *   6. Find the strongest circular contour near the center using a radial voting approach
 *   7. Return detected ring center + radius (normalized 0-1) so caller can compare with overlay guide
 */

/**
 * Analyze a video frame and detect the most prominent ring-like circle.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} source - live video frame
 * @param {object} options
 * @param {number} options.analysisSize - downscaled width for speed (default 160)
 * @param {number} options.edgeThreshold - Sobel magnitude threshold (default 40)
 * @param {number} options.minRadiusFrac - minimum ring radius as fraction of frame width (default 0.08)
 * @param {number} options.maxRadiusFrac - maximum ring radius as fraction of frame width (default 0.40)
 * @returns {{ detected: boolean, cx: number, cy: number, radius: number, confidence: number }}
 *   cx, cy, radius are normalized [0-1] relative to frame dimensions
 */
export function detectRing(source, options = {}) {
  const {
    analysisSize = 160,
    edgeThreshold = 35,
    minRadiusFrac = 0.08,
    maxRadiusFrac = 0.40,
  } = options;

  // Get source dimensions
  const srcW = source.videoWidth || source.width;
  const srcH = source.videoHeight || source.height;
  if (!srcW || !srcH) return { detected: false, cx: 0.5, cy: 0.5, radius: 0, confidence: 0 };

  const scale = analysisSize / srcW;
  const w = analysisSize;
  const h = Math.round(srcH * scale);

  // Draw downscaled frame to offscreen canvas
  const canvas = getOffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 1. Grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 2. Gaussian blur 3x3
  const blurred = gaussianBlur3x3(gray, w, h);

  // 3. Sobel edge magnitude
  const edges = sobelMagnitude(blurred, w, h);

  // 4. Threshold to binary edge map
  const edgeMap = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    edgeMap[i] = edges[i] > edgeThreshold ? 1 : 0;
  }

  // 5. Circle Hough-like voting — accumulate votes for (cx, cy, r)
  const minR = Math.max(3, Math.round(minRadiusFrac * w));
  const maxR = Math.round(maxRadiusFrac * w);
  const rSteps = Math.min(20, maxR - minR + 1);
  const rStep = Math.max(1, (maxR - minR) / rSteps);

  // Focus search in central 70% of frame
  const marginX = Math.round(w * 0.15);
  const marginY = Math.round(h * 0.15);

  // Accumulator: coarse grid for speed
  const cellSize = 3;
  const accW = Math.ceil(w / cellSize);
  const accH = Math.ceil(h / cellSize);
  const accR = Math.ceil(rSteps);
  const acc = new Uint16Array(accW * accH * accR);

  // Collect edge pixels
  const edgePixels = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (edgeMap[y * w + x]) edgePixels.push([x, y]);
    }
  }

  // Subsample edge pixels if too many (speed)
  const maxEdgePixels = 2000;
  let sampledEdges = edgePixels;
  if (edgePixels.length > maxEdgePixels) {
    sampledEdges = [];
    const step = edgePixels.length / maxEdgePixels;
    for (let i = 0; i < maxEdgePixels; i++) {
      sampledEdges.push(edgePixels[Math.floor(i * step)]);
    }
  }

  // Vote: for each edge pixel, for each candidate radius, vote for center
  const angleSteps = 12;
  const angleInc = (2 * Math.PI) / angleSteps;

  for (const [ex, ey] of sampledEdges) {
    for (let ri = 0; ri < rSteps; ri++) {
      const r = minR + ri * rStep;
      for (let a = 0; a < angleSteps; a++) {
        const cx = Math.round(ex + r * Math.cos(a * angleInc));
        const cy = Math.round(ey + r * Math.sin(a * angleInc));
        if (cx < marginX || cx >= w - marginX || cy < marginY || cy >= h - marginY) continue;
        const gx = Math.floor(cx / cellSize);
        const gy = Math.floor(cy / cellSize);
        acc[(gy * accW + gx) * accR + ri]++;
      }
    }
  }

  // Find peak
  let bestVote = 0;
  let bestGx = 0, bestGy = 0, bestRi = 0;
  for (let gy = 0; gy < accH; gy++) {
    for (let gx = 0; gx < accW; gx++) {
      for (let ri = 0; ri < accR; ri++) {
        const v = acc[(gy * accW + gx) * accR + ri];
        if (v > bestVote) {
          bestVote = v;
          bestGx = gx;
          bestGy = gy;
          bestRi = ri;
        }
      }
    }
  }

  // Convert back to pixel coords and normalize
  const detectedCx = (bestGx * cellSize + cellSize / 2) / w;
  const detectedCy = (bestGy * cellSize + cellSize / 2) / h;
  const detectedR = (minR + bestRi * rStep) / w;

  // Confidence: how many votes relative to the expected circumference
  const expectedVotes = (2 * Math.PI * (minR + bestRi * rStep)) / 1.5; // rough expected edge density
  const confidence = Math.min(1, bestVote / Math.max(1, expectedVotes));

  const detected = confidence > 0.25 && bestVote > 15;

  return {
    detected,
    cx: detectedCx,
    cy: detectedCy,
    radius: detectedR,
    confidence,
  };
}

/**
 * Compare detected ring with overlay guide position and return alignment status.
 *
 * @param {{ detected: boolean, cx: number, cy: number, radius: number }} detection
 * @param {{ cx: number, cy: number, radius: number }} guide - overlay guide normalized position
 * @param {number} positionTolerance - how close centers need to be (fraction, default 0.08)
 * @param {number} sizeTolerance - how close radii need to be (fraction, default 0.10)
 * @returns {{ aligned: boolean, positionOff: number, sizeOff: number, hint: string }}
 */
export function checkAlignment(detection, guide, positionTolerance = 0.08, sizeTolerance = 0.12) {
  if (!detection.detected) {
    return { aligned: false, positionOff: 1, sizeOff: 1, hint: 'No ring detected — place your ring in the guide' };
  }

  const dx = detection.cx - guide.cx;
  const dy = detection.cy - guide.cy;
  const positionOff = Math.sqrt(dx * dx + dy * dy);
  const sizeOff = Math.abs(detection.radius - guide.radius);

  if (positionOff > positionTolerance * 2) {
    // Far off — directional hint
    let dir = '';
    if (dy < -0.04) dir += 'down';
    else if (dy > 0.04) dir += 'up';
    if (dx < -0.04) dir += dir ? ' & right' : 'right';
    else if (dx > 0.04) dir += dir ? ' & left' : 'left';
    return { aligned: false, positionOff, sizeOff, hint: `Move ring ${dir || 'to center'}` };
  }

  if (positionOff > positionTolerance) {
    return { aligned: false, positionOff, sizeOff, hint: 'Almost there — nudge ring to center' };
  }

  if (sizeOff > sizeTolerance) {
    const hint = detection.radius < guide.radius
      ? 'Move camera closer to the ring'
      : 'Move camera further from the ring';
    return { aligned: false, positionOff, sizeOff, hint };
  }

  return { aligned: true, positionOff, sizeOff, hint: 'Ring aligned ✓ — capture now!' };
}

// ────────────────────────── Internal helpers ──────────────────────────

let _offscreenCanvas = null;
function getOffscreenCanvas(w, h) {
  if (!_offscreenCanvas) {
    _offscreenCanvas = document.createElement('canvas');
  }
  _offscreenCanvas.width = w;
  _offscreenCanvas.height = h;
  return _offscreenCanvas;
}

function gaussianBlur3x3(src, w, h) {
  const out = new Float32Array(w * h);
  // Kernel: [1 2 1; 2 4 2; 1 2 1] / 16
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      out[y * w + x] =
        (src[(y - 1) * w + x - 1] + 2 * src[(y - 1) * w + x] + src[(y - 1) * w + x + 1] +
         2 * src[y * w + x - 1] + 4 * src[y * w + x] + 2 * src[y * w + x + 1] +
         src[(y + 1) * w + x - 1] + 2 * src[(y + 1) * w + x] + src[(y + 1) * w + x + 1]) / 16;
    }
  }
  return out;
}

function sobelMagnitude(src, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = src[(y - 1) * w + x - 1], tc = src[(y - 1) * w + x], tr = src[(y - 1) * w + x + 1];
      const ml = src[y * w + x - 1],                                   mr = src[y * w + x + 1];
      const bl = src[(y + 1) * w + x - 1], bc = src[(y + 1) * w + x], br = src[(y + 1) * w + x + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      out[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}
