import React, { useState, useEffect } from 'react';
import { StiFileInfo } from '../types/sti';
import { StiApi, StiEditingApi } from '../services/api';
import ConfirmationDialog, { ConfirmationDialogProps } from './ConfirmationDialog';
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
  onFileUpdated?: () => void; // Callback to refresh the file after operations
  managementMode: boolean;
  multiSelectMode: boolean;
}

const ImageList: React.FC<ImageListProps> = ({
  fileInfo,
  currentFile,
  currentIndex,
  selectedImages,
  onImageSelect,
  onImageToggleSelect,
  onClearSelection,
  onFileUpdated,
  managementMode,
  multiSelectMode,
}) => {
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Staging system for reordering
  const [originalOrder, setOriginalOrder] = useState<number[]>([]);
  const [stagedOrder, setStagedOrder] = useState<number[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  
  // Range selection state
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  
  // Debug state for UI feedback - remove after testing
  const [debugInfo, setDebugInfo] = useState<string>('Range selection ready');
  
  const [confirmationDialog, setConfirmationDialog] = useState<Omit<ConfirmationDialogProps, 'onConfirm' | 'onCancel'> & {
    isOpen: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    riskLevel: 'medium',
    onConfirm: async () => {},
  });

  useEffect(() => {
    loadImageMetadata();
  }, [currentFile, fileInfo.num_images]);

  // Initialize staging order when metadata changes
  useEffect(() => {
    if (imageMetadata.length > 0) {
      const initialOrder = imageMetadata.map(img => img.index);
      setOriginalOrder(initialOrder);
      setStagedOrder(initialOrder);
      setHasUnsavedChanges(false);
    }
  }, [imageMetadata]);

  // Reset staging changes when exiting management mode
  useEffect(() => {
    if (!managementMode && hasUnsavedChanges) {
      handleCancelChanges();
    }
    if (!managementMode) {
      onClearSelection();
    }
  }, [managementMode, hasUnsavedChanges, onClearSelection]);

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

  // Get the current display order (staged or original)
  const getCurrentDisplayOrder = (): ImageMetadata[] => {
    return stagedOrder.map(originalIndex =>
      imageMetadata.find(img => img.index === originalIndex)!
    ).filter(Boolean);
  };

  // Apply staging changes locally
  const applyStagedReorder = (newOrder: number[]) => {
    setStagedOrder(newOrder);
    setHasUnsavedChanges(!arraysEqual(newOrder, originalOrder));
  };

  // Check if two arrays are equal
  const arraysEqual = (arr1: number[], arr2: number[]): boolean => {
    return arr1.length === arr2.length && arr1.every((val, index) => val === arr2[index]);
  };

  // Save staged changes to file
  const handleSaveChanges = () => {
    if (!hasUnsavedChanges) return;

    setConfirmationDialog({
      isOpen: true,
      title: 'Save Reorder Changes',
      message: `Apply the current image order to the STI file? This will permanently reorder ${stagedOrder.length} images.`,
      riskLevel: 'medium',
      previewData: [
        'Current order will be saved to file',
        'This action cannot be undone'
      ],
      onConfirm: async () => {
        try {
          setLoading(true);
          await StiEditingApi.reorderImages(currentFile, stagedOrder);
          
          // Update original order and clear unsaved changes
          setOriginalOrder([...stagedOrder]);
          setHasUnsavedChanges(false);
          
          // Force cache invalidation and reload file data
          if (onFileUpdated) {
            await onFileUpdated();
          }
          
          // Reload image metadata to reflect new order
          await loadImageMetadata();
          
          setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error('Failed to save reorder changes:', error);
          alert(`Failed to save changes: ${error}`);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  // Cancel staged changes
  const handleCancelChanges = () => {
    setStagedOrder([...originalOrder]);
    setHasUnsavedChanges(false);
  };

  const handleImageClick = (index: number, event: React.MouseEvent) => {
    if (multiSelectMode || event.ctrlKey || event.metaKey) {
      if (event.shiftKey && lastSelectedIndex !== null && multiSelectMode) {
        // Shift+click in multi-select mode - range selection
        handleRangeSelection(index);
      } else {
        // Multi-select mode or Ctrl/Cmd click - toggle selection
        onImageToggleSelect(index);
        setLastSelectedIndex(index);
      }
    } else {
      // Single select mode
      onImageSelect(index);
      setLastSelectedIndex(index);
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
    setLastSelectedIndex(null);
  };

  const handleRemoveSelected = () => {
    if (selectedImages.length === 0) return;

    const preview = selectedImages
      .sort((a, b) => a - b)
      .map(index => `Remove image #${index} (${imageMetadata[index]?.width}×${imageMetadata[index]?.height})`);

    setConfirmationDialog({
      isOpen: true,
      title: 'Remove Selected Images',
      message: `Are you sure you want to remove ${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''} from this STI file?`,
      riskLevel: 'high',
      previewData: preview,
      onConfirm: async () => {
        try {
          setLoading(true);
          await StiEditingApi.removeImages(currentFile, selectedImages);
          onClearSelection();
          if (onFileUpdated) {
            await onFileUpdated();
          }
          setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error('Failed to remove images:', error);
          alert(`Failed to remove images: ${error}`);
        } finally {
          setLoading(false);
        }
      },
    });
  };


  const handleMoveUp = (originalIndex: number) => {
    const currentStagedIndex = stagedOrder.indexOf(originalIndex);
    if (currentStagedIndex === 0) return;

    const newOrder = [...stagedOrder];
    [newOrder[currentStagedIndex - 1], newOrder[currentStagedIndex]] =
      [newOrder[currentStagedIndex], newOrder[currentStagedIndex - 1]];

    applyStagedReorder(newOrder);
  };

  const handleMoveDown = (originalIndex: number) => {
    const currentStagedIndex = stagedOrder.indexOf(originalIndex);
    if (currentStagedIndex === stagedOrder.length - 1) return;

    const newOrder = [...stagedOrder];
    [newOrder[currentStagedIndex], newOrder[currentStagedIndex + 1]] =
      [newOrder[currentStagedIndex + 1], newOrder[currentStagedIndex]];

    applyStagedReorder(newOrder);
  };

  // Handle range selection with Shift+click
  const handleRangeSelection = (endIndex: number) => {
    if (lastSelectedIndex === null) {
      return;
    }

    const currentDisplayOrder = getCurrentDisplayOrder();
    const startDisplayIndex = currentDisplayOrder.findIndex(img => img.index === lastSelectedIndex);
    const endDisplayIndex = currentDisplayOrder.findIndex(img => img.index === endIndex);

    if (startDisplayIndex === -1 || endDisplayIndex === -1) {
      return;
    }

    const min = Math.min(startDisplayIndex, endDisplayIndex);
    const max = Math.max(startDisplayIndex, endDisplayIndex);

    // Get all indices in the range
    const rangeIndices = currentDisplayOrder.slice(min, max + 1).map(img => img.index);

    // Add all indices in the range to selection that aren't already selected
    rangeIndices.forEach(index => {
      if (!selectedImages.includes(index)) {
        onImageToggleSelect(index);
      }
    });
    
    // Update the last selected index to the end of the range
    setLastSelectedIndex(endIndex);
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
        
      </div>

      {/* Save/Cancel controls for staged changes */}
      {managementMode && hasUnsavedChanges && (
        <div className="staging-controls">
          <div className="staging-info">
            ⚠️ You have unsaved reorder changes
          </div>
          <div className="staging-buttons">
            <button
              className="save-changes-btn"
              onClick={handleSaveChanges}
              disabled={loading}
            >
              💾 Save Changes
            </button>
            <button
              className="cancel-changes-btn"
              onClick={handleCancelChanges}
              disabled={loading}
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {managementMode && multiSelectMode && (
        <div className="selection-controls">
          <button
            className="select-action"
            onClick={handleSelectAll}
            disabled={selectedImages.length === imageMetadata.length || loading}
          >
            All
          </button>
          <button
            className="select-action"
            onClick={handleDeselectAll}
            disabled={selectedImages.length === 0 || loading}
          >
            None
          </button>
        </div>
      )}

      {selectedImages.length > 0 && (
        <div className="selection-info">
          {selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected
          {managementMode && selectedImages.length > 0 && (
            <button
              className="remove-selected-btn"
              onClick={handleRemoveSelected}
              disabled={loading || selectedImages.length >= imageMetadata.length}
              title={selectedImages.length >= imageMetadata.length ? "Cannot remove all images" : "Remove selected images"}
            >
              🗑️ Remove Selected
            </button>
          )}
        </div>
      )}

      <div className={`image-list-content ${managementMode ? 'management-mode' : ''}`}>
        {getCurrentDisplayOrder().map((img, displayIndex) => (
          <div
            key={img.index}
            className={`image-item ${
              img.index === currentIndex ? 'current' : ''
            } ${
              selectedImages.includes(img.index) ? 'selected' : ''
            } ${
              hasUnsavedChanges ? 'staged' : ''
            }`}
            onClick={(e) => {
              if (!managementMode) {
                // Normal mode - use the standard click handler
                handleImageClick(img.index, e);
              } else if (multiSelectMode) {
                // In multi-select mode - clicking on the main item area should only display the image
                onImageSelect(img.index);
              } else {
                // In management mode but not multi-select - allow selection for preview
                onImageSelect(img.index);
                setLastSelectedIndex(img.index);
              }
            }}
          >
            
            <div className="image-item-header">
              <span className="image-index">
                #{img.index}
                {hasUnsavedChanges && displayIndex !== img.index && (
                  <span className="staged-position"> → {displayIndex}</span>
                )}
              </span>
              {managementMode && multiSelectMode && (
                <div
                  className={`selection-checkbox ${
                    selectedImages.includes(img.index) ? 'checked' : ''
                  }`}
                  style={{
                    position: 'absolute',
                    bottom: '6px',
                    right: '6px',
                    pointerEvents: 'auto', // Enable clicks on checkbox
                    cursor: 'pointer'
                  }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering the main click handler
                    
                    // Handle range selection with shift+click on checkbox
                    if (e.shiftKey && lastSelectedIndex !== null) {
                      e.preventDefault();
                      handleRangeSelection(img.index);
                    } else {
                      // Regular checkbox click - toggle selection
                      onImageToggleSelect(img.index);
                      setLastSelectedIndex(img.index);
                    }
                  }}
                >
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

            {managementMode && !multiSelectMode && (
              <div className="management-controls">
                <button
                  className="move-btn"
                  onClick={() => handleMoveUp(img.index)}
                  disabled={displayIndex === 0 || loading}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="move-btn"
                  onClick={() => handleMoveDown(img.index)}
                  disabled={displayIndex === getCurrentDisplayOrder().length - 1 || loading}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        title={confirmationDialog.title}
        message={confirmationDialog.message}
        riskLevel={confirmationDialog.riskLevel}
        previewData={confirmationDialog.previewData}
        onConfirm={confirmationDialog.onConfirm}
        onCancel={() => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default ImageList;