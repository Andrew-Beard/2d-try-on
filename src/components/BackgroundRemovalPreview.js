import React, { useState, useCallback } from 'react';
import { removeBackground } from '../utils/backgroundRemoval';
import './BackgroundRemovalPreview.css';

/**
 * Shows the ring image before/after background removal
 * with tier selection and threshold controls
 */
export default function BackgroundRemovalPreview({ 
  originalImage, 
  processedImage, 
  onProcessed, 
  isProcessing,
  setIsProcessing 
}) {
  const [tier, setTier] = useState('auto');
  const [tolerance, setTolerance] = useState(40);
  const [feather, setFeather] = useState(1.5);
  const [showOriginal, setShowOriginal] = useState(false);
  const [processingInfo, setProcessingInfo] = useState('');

  const processImage = useCallback(async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setProcessingInfo('Processing...');
    
    const startTime = performance.now();
    
    try {
      const result = await removeBackground(originalImage, {
        tier1Tolerance: tolerance,
        tier1Feather: feather,
        forceTier: tier === 'auto' ? null : tier,
      });
      
      const elapsed = (performance.now() - startTime).toFixed(0);
      setProcessingInfo(`Done in ${elapsed}ms`);
      
      // Convert canvas to image
      const img = new Image();
      img.onload = () => {
        onProcessed(img);
        setIsProcessing(false);
      };
      img.src = result.toDataURL('image/png');
    } catch (err) {
      console.error('Background removal failed:', err);
      setProcessingInfo('Failed - using original');
      onProcessed(originalImage);
      setIsProcessing(false);
    }
  }, [originalImage, tolerance, feather, tier, onProcessed, setIsProcessing]);

  // Auto-process when image changes
  React.useEffect(() => {
    if (originalImage) {
      processImage();
    }
  }, [originalImage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!originalImage) return null;

  return (
    <div className="bg-removal-preview">
      <div className="bg-removal-header">
        <h4>Background Removal</h4>
        <span className="processing-info">{processingInfo}</span>
      </div>

      <div className="bg-removal-controls">
        <div className="tier-selector">
          <label>Method:</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="auto">Auto (try Tier 1 → Tier 2)</option>
            <option value="tier1">Tier 1: White BG Keying</option>
            <option value="tier2">Tier 2: Segmentation</option>
          </select>
        </div>

        <div className="bg-control">
          <label>Tolerance: {tolerance}</label>
          <input
            type="range"
            min="10"
            max="100"
            value={tolerance}
            onChange={(e) => setTolerance(parseInt(e.target.value))}
          />
        </div>

        <div className="bg-control">
          <label>Edge Feather: {feather.toFixed(1)}</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.5"
            value={feather}
            onChange={(e) => setFeather(parseFloat(e.target.value))}
          />
        </div>

        <button 
          className="reprocess-btn" 
          onClick={processImage}
          disabled={isProcessing}
        >
          {isProcessing ? '⏳ Processing...' : '🔄 Re-process'}
        </button>
      </div>

      <div className="comparison-view">
        <div className="comparison-toggle">
          <button 
            className={!showOriginal ? 'active' : ''} 
            onClick={() => setShowOriginal(false)}
          >
            Processed
          </button>
          <button 
            className={showOriginal ? 'active' : ''} 
            onClick={() => setShowOriginal(true)}
          >
            Original
          </button>
        </div>
        
        <div className="comparison-image">
          <div className="checkerboard-bg">
            <img
              src={showOriginal ? originalImage.src : (processedImage?.src || originalImage.src)}
              alt={showOriginal ? 'Original' : 'Processed'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
