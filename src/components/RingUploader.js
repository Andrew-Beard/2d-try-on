import React, { useCallback, useRef, useState } from 'react';
import './RingUploader.css';

/**
 * Ring image upload component with drag-and-drop support
 */
export default function RingUploader({ onImageSelected, currentImage }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => onImageSelected(img, file.name);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }, [onImageSelected]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files[0];
    handleFile(file);
  }, [handleFile]);

  return (
    <div className="ring-uploader">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${currentImage ? 'has-image' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {currentImage ? (
          <div className="preview-container">
            <img src={currentImage.src} alt="Ring preview" className="ring-preview" />
            <div className="overlay-text">Click or drop to replace</div>
          </div>
        ) : (
          <div className="upload-prompt">
            <div className="upload-icon">💍</div>
            <p>Drop ring image here</p>
            <p className="sub-text">or click to browse</p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
