import React, { useState, useCallback, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ImageImportApi, DirectoryApi, FileSystem } from '../services/api';
import { ImageAnalysisResult, ImportOptions } from '../types/sti';
import './ImageImportDialog.css';

interface ImageImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  currentStiPath?: string; // If provided, enables "add to existing" option
}

type ImportDestination = 'new' | 'existing';
type PaletteStrategy = 'match' | 'regenerate' | 'auto';

export const ImageImportDialog: React.FC<ImageImportDialogProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  currentStiPath,
}) => {
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [importDestination, setImportDestination] = useState<ImportDestination>('new');
  const [newStiPath, setNewStiPath] = useState<string>('');
  const [fileExists, setFileExists] = useState<boolean>(false);
  const [insertPosition, setInsertPosition] = useState<number>(0);
  const [paletteStrategy, setPaletteStrategy] = useState<PaletteStrategy>('auto');
  const [useCompression, setUseCompression] = useState<boolean>(true);
  const [transparentColor, setTransparentColor] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectImage = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Image files',
            extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif']
          }
        ]
      });

      if (selected && typeof selected === 'string') {
        setSelectedImagePath(selected);
        setError(null);
        setIsAnalyzing(true);

        try {
          const analysis = await ImageImportApi.analyzeImageForImport(selected);
          setImageAnalysis(analysis);
          
          // Auto-suggest filename for new STI files
          if (importDestination === 'new') {
            const fileName = selected.split(/[\\/]/).pop() || 'imported';
            const baseName = fileName.replace(/\.[^/.]+$/, '');
            const directory = selected.substring(0, selected.lastIndexOf('/'));
            setNewStiPath(`${directory}/${baseName}.sti`);
          }
        } catch (err) {
          setError(`Failed to analyze image: ${err}`);
          setImageAnalysis(null);
        } finally {
          setIsAnalyzing(false);
        }
      }
    } catch (err) {
      setError(`Failed to open file dialog: ${err}`);
      setIsAnalyzing(false);
    }
  }, [importDestination]);

  // Check if file exists when path changes
  useEffect(() => {
    const checkFileExists = async () => {
      if (newStiPath && importDestination === 'new') {
        try {
          const exists = await FileSystem.checkFileExists(newStiPath);
          setFileExists(exists);
        } catch (err) {
          console.warn('Failed to check file existence:', err);
          setFileExists(false);
        }
      } else {
        setFileExists(false);
      }
    };

    checkFileExists();
  }, [newStiPath, importDestination]);

  const handleSelectNewStiPath = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'STI files',
            extensions: ['sti']
          }
        ]
      });

      if (selected && typeof selected === 'string') {
        setNewStiPath(selected);
      }
    } catch (err) {
      setError(`Failed to select destination: ${err}`);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedImagePath || !imageAnalysis) {
      setError('No image selected');
      return;
    }

    if (importDestination === 'new' && !newStiPath) {
      setError('Please specify a destination path for the new STI file');
      return;
    }

    if (importDestination === 'existing' && !currentStiPath) {
      setError('No current STI file selected');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const options: ImportOptions = {
        palette_strategy: paletteStrategy,
        compression: useCompression,
        transparent_color: transparentColor ?? undefined,
      };

      if (importDestination === 'new') {
        await ImageImportApi.importImageToNewSti(
          selectedImagePath,
          newStiPath,
          options
        );
      } else {
        await ImageImportApi.importImageToExistingSti(
          selectedImagePath,
          currentStiPath!,
          insertPosition,
          options
        );
      }

      // Clear cache to ensure fresh data
      await DirectoryApi.clearStiCache();
      
      onImportComplete();
      onClose();
      
      // Reset form
      setSelectedImagePath(null);
      setImageAnalysis(null);
      setNewStiPath('');
      setFileExists(false);
      setInsertPosition(0);
      setError(null);
      
    } catch (err) {
      setError(`Import failed: ${err}`);
    } finally {
      setIsImporting(false);
    }
  }, [
    selectedImagePath,
    imageAnalysis,
    importDestination,
    newStiPath,
    currentStiPath,
    insertPosition,
    paletteStrategy,
    useCompression,
    transparentColor,
    onImportComplete,
    onClose
  ]);

  if (!isOpen) return null;

  return (
    <div className="import-dialog-overlay">
      <div className="import-dialog">
        <div className="import-dialog-header">
          <h2>Import Image to STI</h2>
          <button 
            className="close-button"
            onClick={onClose}
            disabled={isImporting}
          >
            ×
          </button>
        </div>

        <div className="import-dialog-content">
          {/* Image Selection */}
          <div className="import-section">
            <h3>Select Image</h3>
            <div className="file-selection">
              <button 
                onClick={handleSelectImage}
                disabled={isAnalyzing || isImporting}
                className="select-file-button"
              >
                {isAnalyzing ? 'Analyzing...' : 'Choose Image File'}
              </button>
              {selectedImagePath && (
                <div className="selected-file">
                  <span>{selectedImagePath.split(/[\\/]/).pop()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Image Preview and Analysis */}
          {imageAnalysis && (
            <div className="import-section">
              <h3>Image Analysis</h3>
              <div className="image-analysis">
                <div className="image-preview">
                  <img src={imageAnalysis.preview} alt="Image preview" />
                </div>
                <div className="analysis-details">
                  <div className="analysis-row">
                    <span>Dimensions:</span>
                    <span>{imageAnalysis.width}×{imageAnalysis.height}</span>
                  </div>
                  <div className="analysis-row">
                    <span>Format:</span>
                    <span>{imageAnalysis.format}</span>
                  </div>
                  <div className="analysis-row">
                    <span>File Size:</span>
                    <span>{(imageAnalysis.file_size / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="analysis-row">
                    <span>Has Alpha:</span>
                    <span>{imageAnalysis.has_alpha ? 'Yes' : 'No'}</span>
                  </div>
                  {imageAnalysis.color_count !== null && (
                    <div className="analysis-row">
                      <span>Colors:</span>
                      <span>{imageAnalysis.color_count}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Import Destination */}
          {imageAnalysis && (
            <div className="import-section">
              <h3>Import Destination</h3>
              <div className="destination-options">
                <label className="radio-option">
                  <input
                    type="radio"
                    value="new"
                    checked={importDestination === 'new'}
                    onChange={(e) => setImportDestination(e.target.value as ImportDestination)}
                    disabled={isImporting}
                  />
                  <span>Create new STI file</span>
                </label>
                {currentStiPath && (
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="existing"
                      checked={importDestination === 'existing'}
                      onChange={(e) => setImportDestination(e.target.value as ImportDestination)}
                      disabled={isImporting}
                    />
                    <span>Add to current STI file</span>
                  </label>
                )}
              </div>

              {importDestination === 'new' && (
                <div className="destination-config">
                  <label>New STI file path:</label>
                  <div className="path-input-group">
                    <input
                      type="text"
                      value={newStiPath}
                      onChange={(e) => setNewStiPath(e.target.value)}
                      placeholder="Enter destination path..."
                      disabled={isImporting}
                    />
                    <button 
                      onClick={handleSelectNewStiPath}
                      disabled={isImporting}
                      className="browse-button"
                    >
                      Browse
                    </button>
                  </div>
                  {fileExists && (
                    <div className="file-exists-warning">
                      ⚠️ Warning: File already exists. Import will overwrite the existing file.
                    </div>
                  )}
                </div>
              )}

              {importDestination === 'existing' && currentStiPath && (
                <div className="destination-config">
                  <div className="current-file">
                    <span>Current file: {currentStiPath.split(/[\\/]/).pop()}</span>
                  </div>
                  <label>Insert at position:</label>
                  <input
                    type="number"
                    min="0"
                    value={insertPosition}
                    onChange={(e) => setInsertPosition(parseInt(e.target.value) || 0)}
                    disabled={isImporting}
                    className="position-input"
                  />
                </div>
              )}
            </div>
          )}

          {/* Import Options */}
          {imageAnalysis && (
            <div className="import-section">
              <h3>Import Options</h3>
              <div className="import-options">
                <div className="option-group">
                  <label>Palette Strategy:</label>
                  <select
                    value={paletteStrategy}
                    onChange={(e) => setPaletteStrategy(e.target.value as PaletteStrategy)}
                    disabled={isImporting || importDestination === 'existing'}
                  >
                    <option value="auto">Auto</option>
                    <option value="match">Match existing palette</option>
                    <option value="regenerate">Generate new palette</option>
                  </select>
                </div>

                <div className="option-group">
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={useCompression}
                      onChange={(e) => setUseCompression(e.target.checked)}
                      disabled={isImporting}
                    />
                    <span>Use ETRLE compression</span>
                  </label>
                </div>

                <div className="option-group">
                  <label>Transparent color index (optional):</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={transparentColor ?? ''}
                    onChange={(e) => setTransparentColor(e.target.value ? parseInt(e.target.value) : null)}
                    disabled={isImporting}
                    placeholder="None"
                    className="transparent-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="import-dialog-footer">
          <button 
            onClick={onClose}
            disabled={isImporting}
            className="cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            disabled={!imageAnalysis || isImporting || (importDestination === 'new' && !newStiPath)}
            className="import-button"
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};