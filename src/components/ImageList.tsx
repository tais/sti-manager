import React, { useState, useEffect } from 'react';
import { StiFileInfo } from '../types/sti';
import { StiApi } from '../services/api';
import './ImageList.css';

interface ImageMetadata {
  index: number;
  width: number;
  height: number;
  thumbnail?: string;
}

interface ImageListProps {
  fileInfo: StiFileInfo;
  currentFile: string;
  currentIndex: number;
  selectedImages: number[];
  onImageSelect: (index: number) => void;
  onImageToggleSelect: (index: number) => void;
  onClearSelection: () => void;
}

const ImageList: React.FC<ImageListProps> = ({
  fileInfo,
  currentFile,
  currentIndex,
  selectedImages,
  onImageSelect,
  onImageToggleSelect,
  onClearSelection,
}) => {
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  useEffect(() => {
    loadImageMetadata();
  }, [currentFile, fileInfo.num_images]);

  const loadImageMetadata = async () => {
    if (!currentFile || fileInfo.num_images === 0) return;

    setLoading(true);
    const metadata: ImageMetadata[] = [];

    try {
      // Load basic metadata for all images
      for (let i = 0; i < fileInfo.num_images; i++) {
        const imageData = await StiApi.getStiImage(currentFile, i);
        metadata.push({
          index: i,
          width: imageData.width,
          height: imageData.height,
        });
      }
      setImageMetadata(metadata);
    } catch (error) {
      console.error('Failed to load image metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (index: number, event: React.MouseEvent) => {
    if (multiSelectMode || event.ctrlKey || event.metaKey) {
      // Multi-select mode or Ctrl/Cmd click
      onImageToggleSelect(index);
    } else {
      // Single select mode
      onImageSelect(index);
    }
  };

  const handleSelectAll = () => {
    const allIndices = imageMetadata.map(img => img.index);
    allIndices.forEach(index => {
      if (!selectedImages.includes(index)) {
        onImageToggleSelect(index);
      }
    });
  };

  const handleDeselectAll = () => {
    onClearSelection();
  };

  if (loading) {
    return (
      <div className="image-list">
        <div className="image-list-header">
          <h3>Images</h3>
        </div>
        <div className="image-list-content">
          <div className="loading">Loading image metadata...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="image-list">
      <div className="image-list-header">
        <h3>Images ({fileInfo.num_images})</h3>
        
        <div className="selection-controls">
          {multiSelectMode && (
            <>
              <button 
                className="select-action"
                onClick={handleSelectAll}
                disabled={selectedImages.length === imageMetadata.length}
              >
                All
              </button>
              <button 
                className="select-action"
                onClick={handleDeselectAll}
                disabled={selectedImages.length === 0}
              >
                None
              </button>
            </>
          )}
          <button
            className={`mode-toggle ${multiSelectMode ? 'active' : ''}`}
            onClick={() => {
              const newMode = !multiSelectMode;
              setMultiSelectMode(newMode);
              // Clear selections when exiting multi-select mode
              if (!newMode && selectedImages.length > 0) {
                onClearSelection();
              }
            }}
            title={multiSelectMode ? 'Exit multi-select mode' : 'Enter multi-select mode'}
          >
            {multiSelectMode ? 'Select ✓' : 'Select □'}
          </button>
        </div>
      </div>

      {selectedImages.length > 0 && (
        <div className="selection-info">
          {selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected
        </div>
      )}

      <div className="image-list-content">
        {imageMetadata.map((img) => (
          <div
            key={img.index}
            className={`image-item ${
              img.index === currentIndex ? 'current' : ''
            } ${
              selectedImages.includes(img.index) ? 'selected' : ''
            }`}
            onClick={(e) => handleImageClick(img.index, e)}
          >
            <div className="image-item-header">
              <span className="image-index">#{img.index}</span>
              {multiSelectMode && (
                <div className={`selection-checkbox ${
                  selectedImages.includes(img.index) ? 'checked' : ''
                }`}>
                  {selectedImages.includes(img.index) ? '✓' : '○'}
                </div>
              )}
            </div>
            
            <div className="image-dimensions">
              {img.width} × {img.height}
            </div>
            
            {img.index === currentIndex && (
              <div className="current-indicator">CURRENT</div>
            )}
          </div>
        ))}
      </div>

      {selectedImages.length > 1 && (
        <div className="batch-actions">
          <div className="batch-actions-header">Batch Actions</div>
          <div className="batch-actions-buttons">
            <button className="batch-action" disabled>
              Export Selected
            </button>
            <button className="batch-action" disabled>
              Move Selected
            </button>
            <button className="batch-action" disabled>
              Copy Selected
            </button>
          </div>
          <div className="batch-actions-note">
            Coming soon: batch operations
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageList;