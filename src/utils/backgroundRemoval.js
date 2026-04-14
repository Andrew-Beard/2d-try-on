/**
 * Background Removal - Two-Tier Approach
 * 
 * Tier 1 (default): Fast white-background keying with tolerance/threshold + edge feather/cleanup
 * Tier 2 (fallback): GrabCut-like segmentation using flood-fill + edge detection
 */

/**
 * Main entry: tries Tier 1, falls back to Tier 2 if quality is poor
 * @param {HTMLImageElement} img 
 * @param {Object} options
 * @returns {Promise<HTMLCanvasElement>} canvas with transparent background
 */
export async function removeBackground(img, options = {}) {
  const {
    tier1Tolerance = 40,
    tier1Feather = 1.5,
    minTransparentRatio = 0.05, // at least 5% should be transparent for tier1 to "succeed"
    maxTransparentRatio = 0.97, // if >97% is transparent, tier1 probably failed
    forceTier = null, // 'tier1' or 'tier2' to force
  } = options;

  // Create working canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (forceTier === 'tier2') {
    return tier2Segmentation(canvas, options);
  }

  // Try Tier 1
  const tier1Result = tier1WhiteKeying(canvas, tier1Tolerance, tier1Feather);
  
  if (forceTier === 'tier1') {
    return tier1Result;
  }

  // Validate Tier 1 quality
  const transparentRatio = countTransparentPixels(tier1Result);
  
  if (transparentRatio < minTransparentRatio || transparentRatio > maxTransparentRatio) {
    console.log(`Tier 1 transparent ratio: ${(transparentRatio * 100).toFixed(1)}% - falling back to Tier 2`);
    // Re-draw original
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return tier2Segmentation(canvas, options);
  }

  console.log(`Tier 1 succeeded - transparent ratio: ${(transparentRatio * 100).toFixed(1)}%`);
  return tier1Result;
}

/**
 * Tier 1: White Background Keying
 * Fast chroma-key style removal for white/near-white backgrounds
 */
function tier1WhiteKeying(canvas, tolerance = 40, featherRadius = 1.5) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Sample corners and edges to determine the background color
  const bgColor = sampleBackgroundColor(data, width, height);
  
  // Create alpha mask based on color distance from background
  const alphaMask = new Float32Array(width * height);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Color distance from background
    const dist = Math.sqrt(
      (r - bgColor.r) ** 2 +
      (g - bgColor.g) ** 2 +
      (b - bgColor.b) ** 2
    );
    
    const pixelIdx = i / 4;
    
    if (dist < tolerance * 0.5) {
      // Definitely background
      alphaMask[pixelIdx] = 0;
    } else if (dist < tolerance) {
      // Transition zone - smooth falloff
      alphaMask[pixelIdx] = (dist - tolerance * 0.5) / (tolerance * 0.5);
    } else {
      // Definitely foreground
      alphaMask[pixelIdx] = 1;
    }
  }

  // Flood fill from edges to only remove connected background regions
  const visited = new Uint8Array(width * height);
  const isBackground = new Uint8Array(width * height);
  const queue = [];

  // Seed from all border pixels
  for (let x = 0; x < width; x++) {
    if (alphaMask[x] < 0.5) { queue.push(x); visited[x] = 1; }
    const bottomIdx = (height - 1) * width + x;
    if (alphaMask[bottomIdx] < 0.5) { queue.push(bottomIdx); visited[bottomIdx] = 1; }
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = y * width;
    if (alphaMask[leftIdx] < 0.5) { queue.push(leftIdx); visited[leftIdx] = 1; }
    const rightIdx = y * width + (width - 1);
    if (alphaMask[rightIdx] < 0.5) { queue.push(rightIdx); visited[rightIdx] = 1; }
  }

  // BFS flood fill
  while (queue.length > 0) {
    const idx = queue.shift();
    isBackground[idx] = 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    const neighbors = [
      y > 0 ? idx - width : -1,
      y < height - 1 ? idx + width : -1,
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
    ];
    
    for (const nIdx of neighbors) {
      if (nIdx >= 0 && !visited[nIdx] && alphaMask[nIdx] < 0.7) {
        visited[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  // Apply alpha based on flood-filled background mask
  for (let i = 0; i < alphaMask.length; i++) {
    if (isBackground[i]) {
      // Use the smooth alpha from color distance
      const smoothAlpha = alphaMask[i];
      data[i * 4 + 3] = Math.round(smoothAlpha * 255);
    }
    // else keep original alpha (255)
  }

  // Apply feathering / edge cleanup
  if (featherRadius > 0) {
    applyEdgeFeather(data, width, height, featherRadius);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Tier 2: Segmentation-based removal
 * Uses center-weighted flood fill + edge detection for complex backgrounds
 */
function tier2Segmentation(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Step 1: Compute edge map using Sobel
  const grayData = new Float32Array(width * height);
  for (let i = 0; i < grayData.length; i++) {
    grayData[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }

  const edges = sobelEdgeDetection(grayData, width, height);
  
  // Step 2: Build foreground probability map
  // Center region is more likely foreground
  const fgProb = new Float32Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // Distance from center (normalized)
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      // Center bias
      const centerBias = 1 - dist * 0.8;
      // Edge strength suggests boundary
      const edgeStrength = edges[idx];
      
      fgProb[idx] = centerBias;
      
      // If near a strong edge, reduce confidence to create boundary
      if (edgeStrength > 0.3) {
        fgProb[idx] *= 0.5;
      }
    }
  }

  // Step 3: Color-based segmentation
  // Sample border colors as background, center colors as foreground
  const borderColors = sampleBorderColors(data, width, height);
  const centerColors = sampleCenterColors(data, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const r = data[idx * 4];
      const g = data[idx * 4 + 1];
      const b = data[idx * 4 + 2];

      const bgDist = minColorDistance(r, g, b, borderColors);
      const fgDist = minColorDistance(r, g, b, centerColors);

      // Color likelihood ratio
      const colorRatio = bgDist / (bgDist + fgDist + 1);
      fgProb[idx] = fgProb[idx] * 0.4 + colorRatio * 0.6;
    }
  }

  // Step 4: Threshold and apply with smooth edges
  const threshold = options.tier2Threshold || 0.45;
  
  for (let i = 0; i < fgProb.length; i++) {
    let alpha;
    if (fgProb[i] > threshold + 0.1) {
      alpha = 255;
    } else if (fgProb[i] < threshold - 0.1) {
      alpha = 0;
    } else {
      // Smooth transition
      alpha = Math.round(((fgProb[i] - (threshold - 0.1)) / 0.2) * 255);
    }
    data[i * 4 + 3] = alpha;
  }

  // Cleanup with morphological operations
  morphologicalCleanup(data, width, height);
  applyEdgeFeather(data, width, height, 2);

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ─── Helper Functions ────────────────────────────────

function sampleBackgroundColor(data, width, height) {
  // Sample from corners and edges
  const samples = [];
  const margin = Math.max(2, Math.min(10, Math.floor(Math.min(width, height) * 0.02)));
  
  for (let y = 0; y < margin; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }
  for (let y = height - margin; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }

  // Average
  const avg = samples.reduce((acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 });
  return {
    r: Math.round(avg.r / samples.length),
    g: Math.round(avg.g / samples.length),
    b: Math.round(avg.b / samples.length),
  };
}

function countTransparentPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let transparent = 0;
  const total = data.length / 4;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) transparent++;
  }
  return transparent / total;
}

function applyEdgeFeather(data, width, height, radius) {
  // Find edge pixels (where alpha transitions) and blur them
  const alphaChannel = new Float32Array(width * height);
  for (let i = 0; i < alphaChannel.length; i++) {
    alphaChannel[i] = data[i * 4 + 3] / 255;
  }

  const r = Math.ceil(radius);
  const blurred = new Float32Array(width * height);

  // Simple box blur on alpha channel near edges only
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const currentAlpha = alphaChannel[idx];
      
      // Check if this is near an edge
      let isEdge = false;
      for (let dy = -1; dy <= 1 && !isEdge; dy++) {
        for (let dx = -1; dx <= 1 && !isEdge; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const neighborAlpha = alphaChannel[ny * width + nx];
            if (Math.abs(currentAlpha - neighborAlpha) > 0.3) {
              isEdge = true;
            }
          }
        }
      }

      if (isEdge) {
        // Gaussian-ish blur
        let sum = 0;
        let weight = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const d = Math.sqrt(dx * dx + dy * dy);
              const w = Math.exp(-(d * d) / (2 * radius * radius));
              sum += alphaChannel[ny * width + nx] * w;
              weight += w;
            }
          }
        }
        blurred[idx] = sum / weight;
      } else {
        blurred[idx] = currentAlpha;
      }
    }
  }

  // Write back
  for (let i = 0; i < blurred.length; i++) {
    data[i * 4 + 3] = Math.round(blurred[i] * 255);
  }
}

function sobelEdgeDetection(gray, width, height) {
  const edges = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel kernels
      const gx = (
        -gray[(y-1)*width+(x-1)] + gray[(y-1)*width+(x+1)] +
        -2*gray[y*width+(x-1)] + 2*gray[y*width+(x+1)] +
        -gray[(y+1)*width+(x-1)] + gray[(y+1)*width+(x+1)]
      );
      
      const gy = (
        -gray[(y-1)*width+(x-1)] - 2*gray[(y-1)*width+x] - gray[(y-1)*width+(x+1)] +
        gray[(y+1)*width+(x-1)] + 2*gray[(y+1)*width+x] + gray[(y+1)*width+(x+1)]
      );
      
      edges[idx] = Math.min(1, Math.sqrt(gx * gx + gy * gy));
    }
  }
  
  return edges;
}

function sampleBorderColors(data, width, height) {
  const colors = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 20));
  
  for (let x = 0; x < width; x += step) {
    for (const y of [0, 1, height - 2, height - 1]) {
      const idx = (y * width + x) * 4;
      colors.push({ r: data[idx], g: data[idx+1], b: data[idx+2] });
    }
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, 1, width - 2, width - 1]) {
      const idx = (y * width + x) * 4;
      colors.push({ r: data[idx], g: data[idx+1], b: data[idx+2] });
    }
  }
  return colors;
}

function sampleCenterColors(data, width, height) {
  const colors = [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.15;
  const step = Math.max(1, Math.floor(radius / 5));
  
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = Math.round(cx + dx);
      const y = Math.round(cy + dy);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        colors.push({ r: data[idx], g: data[idx+1], b: data[idx+2] });
      }
    }
  }
  return colors;
}

function minColorDistance(r, g, b, colorList) {
  let minDist = Infinity;
  for (const c of colorList) {
    const d = Math.sqrt((r-c.r)**2 + (g-c.g)**2 + (b-c.b)**2);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function morphologicalCleanup(data, width, height) {
  // Simple erosion then dilation to remove noise
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3] > 128 ? 1 : 0;
  }

  // Erosion
  const eroded = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      eroded[idx] = (
        alpha[idx] &
        alpha[idx - 1] & alpha[idx + 1] &
        alpha[idx - width] & alpha[idx + width]
      );
    }
  }

  // Dilation
  const dilated = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      dilated[idx] = (
        eroded[idx] |
        eroded[idx - 1] | eroded[idx + 1] |
        eroded[idx - width] | eroded[idx + width]
      );
    }
  }

  // Apply: only modify pixels where the morphological result differs
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] === 1 && dilated[i] === 0) {
      // Remove small foreground noise
      data[i * 4 + 3] = 0;
    }
  }
}

export { tier1WhiteKeying, tier2Segmentation };
