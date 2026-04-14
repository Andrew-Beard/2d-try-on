/**
 * Hand Tracking Module using MediaPipe Hands
 * 
 * Provides finger landmark detection for ring placement
 */

import { Hands } from '@mediapipe/hands';

// MediaPipe hand landmark indices
// Each finger has 4 landmarks: MCP (base), PIP, DIP, TIP
export const FINGER_LANDMARKS = {
  thumb:  { mcp: 2, pip: 3, dip: 3, tip: 4 },
  index:  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring:   { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky:  { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/**
 * Ring placement zone: between PIP and DIP joints (where rings are actually worn)
 */
export function getRingPosition(landmarks, fingerName = 'ring') {
  const finger = FINGER_LANDMARKS[fingerName];
  if (!finger || !landmarks) return null;

  const pip = landmarks[finger.pip];
  const dip = landmarks[finger.dip];
  const mcp = landmarks[finger.mcp];

  if (!pip || !dip || !mcp) return null;

  // Ring position is between PIP and DIP (closer to PIP, where real rings sit)
  const ringX = pip.x * 0.6 + dip.x * 0.4;
  const ringY = pip.y * 0.6 + dip.y * 0.4;
  const ringZ = pip.z * 0.6 + dip.z * 0.4;

  // Calculate finger angle for ring rotation
  const dx = dip.x - pip.x;
  const dy = dip.y - pip.y;
  const angle = Math.atan2(dy, dx);

  // Estimate finger width from MCP to PIP distance (rough approximation)
  const fingerLength = Math.sqrt(
    (dip.x - pip.x) ** 2 + (dip.y - pip.y) ** 2
  );
  const fingerWidth = fingerLength * 0.8; // approximate width relative to segment length

  return {
    x: ringX,
    y: ringY,
    z: ringZ,
    angle: angle,
    fingerWidth: fingerWidth,
    fingerLength: fingerLength,
    pip: { x: pip.x, y: pip.y },
    dip: { x: dip.x, y: dip.y },
  };
}

/**
 * Initialize and return a MediaPipe Hands instance
 */
export function createHandTracker(onResults) {
  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(onResults);

  return hands;
}

/**
 * Process a single image through hand detection
 * @param {Hands} hands - MediaPipe Hands instance 
 * @param {HTMLImageElement|HTMLCanvasElement} image 
 * @returns {Promise<Object>} detection results
 */
export async function detectHandsInImage(hands, image) {
  return new Promise((resolve) => {
    let resolved = false;
    
    hands.onResults((results) => {
      if (!resolved) {
        resolved = true;
        resolve(results);
      }
    });

    hands.send({ image }).catch((err) => {
      console.error('Hand detection error:', err);
      if (!resolved) {
        resolved = true;
        resolve({ multiHandLandmarks: [], multiHandedness: [] });
      }
    });
  });
}

/**
 * Draw hand landmarks on a canvas (for debugging/visualization)
 */
export function drawHandLandmarks(ctx, landmarks, width, height, options = {}) {
  const { color = '#00FF00', lineWidth = 2, dotSize = 4 } = options;
  
  if (!landmarks || landmarks.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  // Draw connections
  const connections = [
    [0,1],[1,2],[2,3],[3,4],       // thumb
    [0,5],[5,6],[6,7],[7,8],       // index
    [0,9],[9,10],[10,11],[11,12],  // middle
    [0,13],[13,14],[14,15],[15,16],// ring
    [0,17],[17,18],[18,19],[19,20],// pinky
    [5,9],[9,13],[13,17],          // palm
  ];

  for (const [a, b] of connections) {
    const la = landmarks[a];
    const lb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(la.x * width, la.y * height);
    ctx.lineTo(lb.x * width, lb.y * height);
    ctx.stroke();
  }

  // Draw landmark dots
  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, dotSize, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Determine hand type (left/right) from handedness data
 */
export function getHandType(handedness) {
  if (!handedness || handedness.length === 0) return 'unknown';
  // MediaPipe reports the classification label
  return handedness[0]?.label?.toLowerCase() || 'unknown';
}
