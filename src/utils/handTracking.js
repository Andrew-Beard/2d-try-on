/**
 * Hand Tracking Module using @mediapipe/tasks-vision (HandLandmarker)
 * 
 * Provides finger landmark detection for ring placement.
 * Uses the newer tasks-vision API which is more reliable than the legacy @mediapipe/hands.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

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

const FINGER_ADJACENT = {
  thumb: ['index'],
  index: ['middle'],
  middle: ['index', 'ring'],
  ring: ['middle', 'pinky'],
  pinky: ['ring'],
};

function distance2D(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function estimateFingerWidth(landmarks, fingerName, finger) {
  const pip = landmarks[finger.pip];
  const dip = landmarks[finger.dip];
  const mcp = landmarks[finger.mcp];

  const candidates = [];

  const segmentLength = distance2D(pip, dip);
  if (segmentLength) {
    candidates.push(segmentLength * 0.42);
    candidates.push(segmentLength * 0.42); // double weight for segment-based
  }

  const baseLength = distance2D(mcp, pip);
  if (baseLength) {
    candidates.push(baseLength * 0.36);
  }

  const adjacentFingers = FINGER_ADJACENT[fingerName] || [];
  for (const adjacentName of adjacentFingers) {
    const adjacentMcpIndex = FINGER_LANDMARKS[adjacentName]?.mcp;
    const adjacentPipIndex = FINGER_LANDMARKS[adjacentName]?.pip;
    const adjacentMcp = adjacentMcpIndex !== undefined ? landmarks[adjacentMcpIndex] : null;
    const adjacentPip = adjacentPipIndex !== undefined ? landmarks[adjacentPipIndex] : null;
    // MCP-to-MCP span is most reliable indicator of finger girth
    const mcpSpan = distance2D(mcp, adjacentMcp);
    if (mcpSpan) {
      candidates.push(mcpSpan * 0.52);
      candidates.push(mcpSpan * 0.52); // double weight — most stable
    }
    const pipSpan = distance2D(pip, adjacentPip);
    if (pipSpan) {
      candidates.push(pipSpan * 0.50);
    }
  }

  const numericCandidates = candidates.filter((value) => Number.isFinite(value) && value > 0);
  if (numericCandidates.length === 0) {
    return 0.045;
  }

  numericCandidates.sort((a, b) => a - b);
  const mid = Math.floor(numericCandidates.length / 2);
  const rawWidth =
    numericCandidates.length % 2 === 0
      ? (numericCandidates[mid - 1] + numericCandidates[mid]) / 2
      : numericCandidates[mid];

  return Math.min(0.08, Math.max(0.02, rawWidth));
}

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

  // Ring anchored exactly to landmark 14 (PIP joint of the ring finger)
  const ringX = pip.x;
  const ringY = pip.y;
  const ringZ = pip.z;

  // Calculate finger angle for ring rotation
  const dx = dip.x - pip.x;
  const dy = dip.y - pip.y;
  const angle = Math.atan2(dy, dx);

  const fingerLength = Math.sqrt(
    (dip.x - pip.x) ** 2 + (dip.y - pip.y) ** 2
  );
  const fingerWidth = estimateFingerWidth(landmarks, fingerName, finger);

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
 * Detect if the hand is in a closed fist / palm-closed position.
 * Returns true when ≥ 3 of the 4 non-thumb fingers are curled.
 * Uses two independent criteria for robustness across hand orientations:
 *  1. Fingertip closer to wrist than the MCP joint (folded in).
 *  2. Raw tip-y > pip-y in normalized screen space (curling downward).
 */
export function isHandClosed(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const fingerChecks = [
    { tip: 8,  pip: 6,  mcp: 5  }, // index
    { tip: 12, pip: 10, mcp: 9  }, // middle
    { tip: 16, pip: 14, mcp: 13 }, // ring
    { tip: 20, pip: 18, mcp: 17 }, // pinky
  ];

  const wrist = landmarks[0];
  let curledCount = 0;

  for (const { tip, pip, mcp } of fingerChecks) {
    const tipLm = landmarks[tip];
    const pipLm = landmarks[pip];
    const mcpLm = landmarks[mcp];

    const tipToWrist = Math.hypot(tipLm.x - wrist.x, tipLm.y - wrist.y);
    const mcpToWrist = Math.hypot(mcpLm.x - wrist.x, mcpLm.y - wrist.y);

    // Criterion 1: tip folded inward (closer to wrist than MCP)
    const isFolded = tipToWrist < mcpToWrist * 1.05;
    // Criterion 2: tip below PIP in screen space
    const isBelowPip = tipLm.y > pipLm.y + 0.01;

    if (isFolded || isBelowPip) curledCount++;
  }

  return curledCount >= 3;
}

/**
 * Compute per-frame hand velocity as the normalized displacement of the
 * wrist landmark (index 0) between consecutive landmark sets.
 */
export function computeHandVelocity(prevLandmarks, currLandmarks) {
  if (!prevLandmarks || !currLandmarks) return 0;
  const p = prevLandmarks[0];
  const c = currLandmarks[0];
  return Math.hypot(c.x - p.x, c.y - p.y);
}

/**
 * Create and initialize a HandLandmarker instance.
 * Returns a promise that resolves to the ready-to-use detector.
 */
let _handLandmarkerPromise = null;

export async function createHandLandmarker() {
  // Singleton — reuse if already created
  if (_handLandmarkerPromise) return _handLandmarkerPromise;

  _handLandmarkerPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
    );

    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    console.log('HandLandmarker model loaded');
    return handLandmarker;
  })();

  return _handLandmarkerPromise;
}

/**
 * Detect hands in a video frame.
 * Must be called with increasing timestamps (use performance.now()).
 * 
 * @param {HandLandmarker} handLandmarker
 * @param {HTMLVideoElement} video
 * @param {number} timestamp - monotonically increasing ms timestamp
 * @returns {{ landmarks: Array|null, handedness: Array|null }}
 */
export function detectForVideo(handLandmarker, video, timestamp) {
  try {
    const results = handLandmarker.detectForVideo(video, timestamp);
    if (results.landmarks && results.landmarks.length > 0) {
      return {
        landmarks: results.landmarks[0],
        handedness: results.handedness?.[0] || null,
      };
    }
  } catch (e) {
    // Frame detection error — skip
  }
  return { landmarks: null, handedness: null };
}

/**
 * Reset the singleton so a new HandLandmarker can be created
 */
export function resetHandLandmarker() {
  _handLandmarkerPromise = null;
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
