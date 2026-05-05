import React, { useState, useCallback } from 'react';
import TryOnCanvas from './components/TryOnCanvas';
import ExampleRings from './components/ExampleRings';
import BackgroundRemovalPreview from './components/BackgroundRemovalPreview';
import ControlPanel from './components/ControlPanel';
import './App.css';

const DEFAULT_CONTROLS = {
  finger: 'ring',
  scale: 1.43,
  rotation: -95,
  offsetXLeft: 13,
  offsetXRight: -10,
  offsetY: 55,
  opacity: 1.0,
  showLandmarks: false,
};

function App() {
  const [originalRingImage, setOriginalRingImage] = useState(null);
  const [processedRingImage, setProcessedRingImage] = useState(null);
  const [ringName, setRingName] = useState('');
  const [controls, setControls] = useState({ ...DEFAULT_CONTROLS });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPalmClosed, setIsPalmClosed] = useState(false);

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
          Choose a ring image → auto background removal → live hand tracking overlay
        </p>
      </header>

      <div className="app-layout">
        {/* Main canvas area */}
        <div className="main-area">
          <TryOnCanvas 
            ringImage={activeRingImage} 
            controls={controls}
            onPalmClosed={setIsPalmClosed}
          />
          
          {/* Instructions */}
          <div className="instructions">
            <div className="step">
              <span className="step-num">1</span>
              <span>Pick a ring image below</span>
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
            isPalmClosed={isPalmClosed}
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
