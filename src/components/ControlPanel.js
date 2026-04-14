import React from 'react';
import './ControlPanel.css';

const FINGER_OPTIONS = [
  { value: 'thumb', label: '👍 Thumb' },
  { value: 'index', label: '☝️ Index' },
  { value: 'middle', label: '🖕 Middle' },
  { value: 'ring', label: '💍 Ring' },
  { value: 'pinky', label: '🤙 Pinky' },
];

/**
 * Control panel for ring overlay adjustments
 */
export default function ControlPanel({ controls, onChange, onReset }) {
  const handleChange = (key, value) => {
    onChange({ ...controls, [key]: value });
  };

  return (
    <div className="control-panel">
      <div className="control-header">
        <h3>Ring Controls</h3>
        <button className="reset-btn" onClick={onReset} title="Reset all">
          ↺ Reset
        </button>
      </div>

      <div className="control-group">
        <label>Finger</label>
        <div className="finger-selector">
          {FINGER_OPTIONS.map((f) => (
            <button
              key={f.value}
              className={`finger-btn ${controls.finger === f.value ? 'active' : ''}`}
              onClick={() => handleChange('finger', f.value)}
              title={f.label}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <label>
          Size <span className="value">{(controls.scale * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.2"
          max="3"
          step="0.05"
          value={controls.scale}
          onChange={(e) => handleChange('scale', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          Rotation <span className="value">{controls.rotation.toFixed(0)}°</span>
        </label>
        <input
          type="range"
          min="-180"
          max="180"
          step="1"
          value={controls.rotation}
          onChange={(e) => handleChange('rotation', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          X Offset <span className="value">{controls.offsetX.toFixed(0)}px</span>
        </label>
        <input
          type="range"
          min="-200"
          max="200"
          step="1"
          value={controls.offsetX}
          onChange={(e) => handleChange('offsetX', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          Y Offset <span className="value">{controls.offsetY.toFixed(0)}px</span>
        </label>
        <input
          type="range"
          min="-200"
          max="200"
          step="1"
          value={controls.offsetY}
          onChange={(e) => handleChange('offsetY', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          Opacity <span className="value">{(controls.opacity * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={controls.opacity}
          onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={controls.showLandmarks}
            onChange={(e) => handleChange('showLandmarks', e.target.checked)}
          />
          Show hand landmarks
        </label>
      </div>
    </div>
  );
}
