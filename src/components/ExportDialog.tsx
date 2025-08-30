import React, { useState, useEffect } from 'react';
import { StiFileInfo } from '../types/sti';
import { StiApi } from '../services/api';
import { open } from '@tauri-apps/plugin-dialog';
import './ExportDialog.css';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileInfo: StiFileInfo;
  currentFile: string;
  selectedImages?: number[];
  currentIndex?: number;
}

interface ImageMetadata {
  index: number;
  width: number;
  height: number;
  selected: boolean;
}

export type ExportFormat = 'BMP' | 'PNG' | 'JPEG' | 'TIFF';

const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  fileInfo,
  currentFile,
  selectedImages = [],
  currentIndex: _currentIndex = 0,
}) => {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('BMP');
  const [exportPath, setExportPath] = useState('');
  const [imagesToExport, setImagesToExport] = useState<ImageMetadata[]>([]);
  const [exportMode, setExportMode] = useState<'all' | 'selected'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [namingPattern, setNamingPattern] = useState('{filename}_{index}');

  useEffect(() => {
    if (isOpen) {
      loadImageMetadata();
      // Set default export path to the directory containing the current file
      const lastSlashIndex = currentFile.lastIndexOf('/');
      const directoryPath = lastSlashIndex !== -1 ? currentFile.substring(0, lastSlashIndex) : '.';
      setExportPath(directoryPath);
      
      // Set default naming pattern based on number of images
      if (fileInfo.num_images === 1) {
        setNamingPattern('{filename}'); // No index for single image
      } else {
        setNamingPattern('{filename}_{index}'); // Include index for multiple images
      }
      
      // Determine default export mode
      if (selectedImages.length > 0) {
        setExportMode('selected');
      } else {
        setExportMode('all');
      }
    }
  }, [isOpen, currentFile, fileInfo, selectedImages]);

  const loadImageMetadata = async () => {
    if (!currentFile || fileInfo.num_images === 0) return;

    const metadata: ImageMetadata[] = [];
    try {
      for (let i = 0; i < fileInfo.num_images; i++) {
        const imageData = await StiApi.getStiImage(currentFile, i);
        metadata.push({
          index: i,
          width: imageData.width,
          height: imageData.height,
          selected: selectedImages.includes(i) || exportMode === 'all',
        });
      }
      setImagesToExport(metadata);
    } catch (error) {
      console.error('Failed to load image metadata:', error);
    }
  };

  const handleImageToggle = (index: number) => {
    // If we're in "all" mode and unchecking an item, switch to "selected" mode
    if (exportMode === 'all') {
      setExportMode('selected');
    }
    
    setImagesToExport(prev =>
      prev.map(img =>
        img.index === index ? { ...img, selected: !img.selected } : img
      )
    );
  };

  const handleSelectAll = () => {
    // If we're in "all" mode, don't change individual selections
    if (exportMode !== 'all') {
      setImagesToExport(prev => prev.map(img => ({ ...img, selected: true })));
    }
  };

  const handleSelectNone = () => {
    // If we're in "all" mode and selecting none, switch to "selected" mode
    if (exportMode === 'all') {
      setExportMode('selected');
    }
    setImagesToExport(prev => prev.map(img => ({ ...img, selected: false })));
  };

  const handleExportModeChange = (mode: 'all' | 'selected') => {
    setExportMode(mode);
    
    if (mode === 'all') {
      setImagesToExport(prev => prev.map(img => ({ ...img, selected: true })));
    } else if (mode === 'selected') {
      setImagesToExport(prev =>
        prev.map(img => ({ ...img, selected: selectedImages.includes(img.index) }))
      );
    }
  };

  const handleBrowseExportPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Export Directory',
        defaultPath: exportPath || undefined,
      });
      
      if (selected && typeof selected === 'string') {
        setExportPath(selected);
      }
    } catch (error) {
      console.error('Failed to open directory picker:', error);
      // Fallback to prompt
      const newPath = prompt('Enter export directory path:', exportPath);
      if (newPath) {
        setExportPath(newPath);
      }
    }
  };

  const getSelectedImages = () => {
    return imagesToExport.filter(img => img.selected);
  };

  const generateFilename = (baseFilename: string, imageIndex: number, format: string) => {
    const fileName = baseFilename.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'image';
    
    return namingPattern
      .replace('{filename}', fileName)
      .replace('{index}', imageIndex.toString().padStart(3, '0'))
      .replace('{format}', format.toLowerCase()) + '.' + format.toLowerCase();
  };

  const handleExport = async () => {
    const selectedImages = getSelectedImages();
    if (selectedImages.length === 0) {
      alert('Please select at least one image to export.');
      return;
    }

    if (!exportPath.trim()) {
      alert('Please specify an export path.');
      return;
    }

    setIsExporting(true);
    setExportProgress({ current: 0, total: selectedImages.length });

    try {
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        const filename = generateFilename(currentFile, img.index, exportFormat);
        const fullPath = `${exportPath}/${filename}`;
        
        setExportProgress({ current: i + 1, total: selectedImages.length });
        
        await StiApi.exportImage(currentFile, img.index, fullPath, exportFormat);
      }
      
      alert(`Successfully exported ${selectedImages.length} image(s) to ${exportPath}`);
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  };

  if (!isOpen) return null;

  const selectedCount = getSelectedImages().length;

  return (
    <div className="export-dialog-overlay">
      <div className="export-dialog">
        <div className="export-dialog-header">
          <h2>Export Images</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="export-dialog-content">
          {/* Format Selection */}
          <div className="export-section">
            <label>Export Format:</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              disabled={isExporting}
            >
              <option value="BMP">BMP - Windows Bitmap</option>
              <option value="PNG">PNG - Portable Network Graphics</option>
              <option value="JPEG">JPEG - Joint Photographic Experts Group</option>
              <option value="TIFF">TIFF - Tagged Image File Format</option>
            </select>
          </div>

          {/* Export Mode Selection - only show for multi-image STI files */}
          {fileInfo.num_images > 1 && (
            <div className="export-section">
              <label>Export Mode:</label>
              <div className="export-mode-options">
                <label className="radio-option">
                  <input
                    type="radio"
                    value="all"
                    checked={exportMode === 'all'}
                    onChange={() => handleExportModeChange('all')}
                    disabled={isExporting}
                  />
                  All Images ({fileInfo.num_images})
                </label>
                {selectedImages.length > 0 && (
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="selected"
                      checked={exportMode === 'selected'}
                      onChange={() => handleExportModeChange('selected')}
                      disabled={isExporting}
                    />
                    Previously Selected ({selectedImages.length})
                  </label>
                )}
                <label className="radio-option">
                  <input
                    type="radio"
                    value="selected"
                    checked={exportMode === 'selected'}
                    onChange={() => handleExportModeChange('selected')}
                    disabled={isExporting}
                  />
                  Selected Images
                </label>
              </div>
            </div>
          )}

          {/* Image Selection */}
          {fileInfo.num_images > 1 && (
            <div className="export-section">
              <div className="section-header">
                <label>Select Images to Export ({selectedCount} selected):</label>
                <div className="selection-buttons">
                  <button
                    onClick={handleSelectAll}
                    disabled={isExporting || exportMode === 'all'}
                  >
                    All
                  </button>
                  <button
                    onClick={handleSelectNone}
                    disabled={isExporting}
                  >
                    None
                  </button>
                </div>
              </div>
              
              <div className="image-selection-list">
                {imagesToExport.map((img) => (
                  <div key={img.index} className="image-selection-item">
                    <label className="image-checkbox">
                      <input
                        type="checkbox"
                        checked={img.selected}
                        onChange={() => handleImageToggle(img.index)}
                        disabled={isExporting || exportMode === 'all'}
                      />
                      <span className="image-info">
                        #{img.index} ({img.width}×{img.height})
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export Path */}
          <div className="export-section">
            <label>Export Directory:</label>
            <div className="path-input-group">
              <input
                type="text"
                value={exportPath}
                onChange={(e) => setExportPath(e.target.value)}
                placeholder="Select export directory..."
                disabled={isExporting}
              />
              <button
                onClick={handleBrowseExportPath}
                disabled={isExporting}
                className="browse-button"
              >
                Browse...
              </button>
            </div>
          </div>

          {/* Naming Pattern */}
          <div className="export-section">
            <label>File Naming Pattern:</label>
            <input
              type="text"
              value={namingPattern}
              onChange={(e) => setNamingPattern(e.target.value)}
              placeholder="{filename}_{index}"
              disabled={isExporting}
            />
            <div className="naming-help">
              Available variables: {'{filename}'}, {'{index}'}, {'{format}'}
            </div>
          </div>

          {/* Progress */}
          {isExporting && (
            <div className="export-section">
              <label>Export Progress:</label>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                />
              </div>
              <div className="progress-text">
                {exportProgress.current} / {exportProgress.total} images exported
              </div>
            </div>
          )}
        </div>

        <div className="export-dialog-footer">
          <button onClick={onClose} disabled={isExporting}>Cancel</button>
          <button
            onClick={handleExport}
            disabled={isExporting || selectedCount === 0}
            className="export-button"
          >
            {isExporting ? 'Exporting...' : `Export ${selectedCount} Image${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;