import React, { useState, useCallback } from 'react';
import TryOnCanvas from './components/TryOnCanvas';
import RingUploader from './components/RingUploader';
import ExampleRings from './components/ExampleRings';
import BackgroundRemovalPreview from './components/BackgroundRemovalPreview';
import ControlPanel from './components/ControlPanel';
import './App.css';

const DEFAULT_CONTROLS = {
  finger: 'ring',
  scale: 1.0,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  opacity: 1.0,
  showLandmarks: false,
};

function App() {
  const [originalRingImage, setOriginalRingImage] = useState(null);
  const [processedRingImage, setProcessedRingImage] = useState(null);
  const [ringName, setRingName] = useState('');
  const [controls, setControls] = useState({ ...DEFAULT_CONTROLS });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImageSelected = useCallback((img, name) => {
    setOriginalRingImage(img);
    setProcessedRingImage(null);
    setRingName(name || 'Uploaded Ring');
  }, []);

  const handleProcessed = useCallback((img) => {
    setProcessedRingImage(img);
  }, []);

  const handleReset = useCallback(() => {
    setControls({ ...DEFAULT_CONTROLS });
  }, []);

  // The ring image to use for try-on (processed if available, otherwise original)
  const activeRingImage = processedRingImage || originalRingImage;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>💍 Ring Virtual Try-On</h1>
        </div>
        <p className="header-subtitle">
          Upload a ring image → auto background removal → live hand tracking overlay
        </p>
      </header>

      <div className="app-layout">
        {/* Main canvas area */}
        <div className="main-area">
          <TryOnCanvas 
            ringImage={activeRingImage} 
            controls={controls}
          />
          
          {/* Instructions */}
          <div className="instructions">
            <div className="step">
              <span className="step-num">1</span>
              <span>Upload or pick a ring image below</span>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <span>Background is auto-removed (adjustable)</span>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <span>Start camera & show your hand</span>
            </div>
            <div className="step">
              <span className="step-num">4</span>
              <span>Adjust size, rotation, finger & position</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="sidebar">
          {/* Upload Section */}
          <div className="sidebar-section">
            <h3 className="section-title">Upload Ring Image</h3>
            <RingUploader 
              onImageSelected={handleImageSelected}
              currentImage={originalRingImage}
            />
          </div>

          {/* Example Rings */}
          <ExampleRings onSelect={handleImageSelected} />

          {/* Background Removal Preview */}
          <BackgroundRemovalPreview
            originalImage={originalRingImage}
            processedImage={processedRingImage}
            onProcessed={handleProcessed}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
          />

          {/* Ring Name */}
          {ringName && (
            <div className="ring-info">
              <span className="ring-info-label">Active Ring:</span>
              <span className="ring-info-name">{ringName}</span>
              {isProcessing && <span className="ring-info-processing">⏳ Processing BG...</span>}
            </div>
          )}

          {/* Controls */}
          <ControlPanel
            controls={controls}
            onChange={setControls}
            onReset={handleReset}
          />
        </aside>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Phase 1 – Core Pipeline Demo · MediaPipe Hands · Two-Tier Background Removal
        </p>
      </footer>
    </div>
  );
}

export default App;
