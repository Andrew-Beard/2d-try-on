import React, { useState, useCallback } from 'react';
import './ExampleRings.css';

const EXAMPLE_RINGS = [
  {
    id: 'white-bg',
    src: '/rings/ring-white-bg.svg',
    label: 'White Background',
    description: 'Clean white bg - ideal for Tier 1',
    difficulty: 'easy',
  },
  {
    id: 'shadow-bg',
    src: '/rings/ring-shadow-bg.svg',
    label: 'Shadow / Gradient',
    description: 'Gradient bg with shadows - Tier 1 edge case',
    difficulty: 'medium',
  },
  {
    id: 'complex-bg',
    src: '/rings/ring-complex-bg.svg',
    label: 'Complex Background',
    description: 'Dark textured bg - needs Tier 2',
    difficulty: 'hard',
  },
];

export default function ExampleRings({ onSelect }) {
  const [loading, setLoading] = useState(null);

  const handleSelect = useCallback((ring) => {
    setLoading(ring.id);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      onSelect(img, ring.label);
      setLoading(null);
    };
    img.onerror = () => {
      console.error('Failed to load example ring:', ring.src);
      setLoading(null);
    };
    img.src = ring.src;
  }, [onSelect]);

  return (
    <div className="example-rings">
      <h4>Example Rings</h4>
      <p className="example-description">Test background removal quality:</p>
      <div className="ring-grid">
        {EXAMPLE_RINGS.map((ring) => (
          <button
            key={ring.id}
            className={`ring-card ${loading === ring.id ? 'loading' : ''}`}
            onClick={() => handleSelect(ring)}
            disabled={loading !== null}
          >
            <div className={`ring-thumb difficulty-${ring.difficulty}`}>
              <img src={ring.src} alt={ring.label} />
            </div>
            <span className="ring-label">{ring.label}</span>
            <span className={`difficulty-badge ${ring.difficulty}`}>
              {ring.difficulty}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
