import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EditableImage, EditableStiFile } from '../types/sti';
import { StiEditingApi } from '../services/api';
import './ImageEditor.css';

interface ImageEditorProps {
  editableSti: EditableStiFile;
  currentImageIndex: number;
  onImageChange: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onUpdate: (updatedSti: EditableStiFile) => void;
}

interface PaintTool {
  type: 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'pan';
  size: number;
}

interface HistoryState {
  editableSti: EditableStiFile;
  currentImageIndex: number;
  timestamp: number;
  actionDescription: string;
}

const ImageEditor: React.FC<ImageEditorProps> = ({
  editableSti,
  currentImageIndex,
  onImageChange,
  onSave,
  onCancel,
  onUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<PaintTool>({ type: 'brush', size: 1 });
  const [selectedColor, setSelectedColor] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [showTransparent, setShowTransparent] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [strokeStarted, setStrokeStarted] = useState(false);

  // Undo/Redo history system
  const [historyState, setHistoryState] = useState(() => {
    const initialState: HistoryState = {
      editableSti: JSON.parse(JSON.stringify(editableSti)),
      currentImageIndex,
      timestamp: Date.now(),
      actionDescription: 'Initial state'
    };
    return {
      history: [initialState],
      index: 0
    };
  });
  const [isHistoryAction, setIsHistoryAction] = useState(false);

  const { history, index: historyIndex } = historyState;
  const currentImage = editableSti.images[currentImageIndex];

  useEffect(() => {
    drawCanvas();
  }, [currentImage, zoom, pan, showGrid, showTransparent]);

  // Add keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      
      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (ctrlOrCmd && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match the container
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas with checkerboard pattern for transparency
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw checkerboard for transparency indication
    const checkerSize = 8 * zoom;
    if (checkerSize > 4) {
      ctx.fillStyle = '#e0e0e0';
      for (let x = 0; x < canvas.width; x += checkerSize * 2) {
        for (let y = 0; y < canvas.height; y += checkerSize * 2) {
          ctx.fillRect(x, y, checkerSize, checkerSize);
          ctx.fillRect(x + checkerSize, y + checkerSize, checkerSize, checkerSize);
        }
      }
    }

    // Calculate scaled dimensions and position
    const scaledWidth = currentImage.width * zoom;
    const scaledHeight = currentImage.height * zoom;
    const x = (canvas.width - scaledWidth) / 2 + pan.x;
    const y = (canvas.height - scaledHeight) / 2 + pan.y;

    // Draw image pixels
    if (editableSti.is_8bit && editableSti.palette) {
      // 8-bit indexed color
      for (let py = 0; py < currentImage.height; py++) {
        for (let px = 0; px < currentImage.width; px++) {
          const dataIndex = py * currentImage.width + px;
          const paletteIndex = currentImage.data[dataIndex];
          
          const color = editableSti.palette[paletteIndex] || [255, 0, 255]; // Magenta for invalid indices
          
          // Handle transparent pixels (index 0)
          if (paletteIndex === 0) {
            if (showTransparent) {
              // Show transparent pixels as semi-transparent
              ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.3)`;
              ctx.fillRect(
                x + px * zoom,
                y + py * zoom,
                zoom,
                zoom
              );
            }
            // Skip drawing if showTransparent is false
          } else {
            // Draw non-transparent pixels normally
            ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            ctx.fillRect(
              x + px * zoom,
              y + py * zoom,
              zoom,
              zoom
            );
          }
        }
      }
    } else {
      // 16-bit RGB565 (simplified representation)
      for (let py = 0; py < currentImage.height; py++) {
        for (let px = 0; px < currentImage.width; px++) {
          const dataIndex = (py * currentImage.width + px) * 2;
          if (dataIndex + 1 < currentImage.data.length) {
            const rgb565 = (currentImage.data[dataIndex + 1] << 8) | currentImage.data[dataIndex];
            const r = ((rgb565 >> 11) & 0x1F) << 3;
            const g = ((rgb565 >> 5) & 0x3F) << 2;
            const b = (rgb565 & 0x1F) << 3;
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(
              x + px * zoom,
              y + py * zoom,
              zoom,
              zoom
            );
          }
        }
      }
    }

    // Draw grid if enabled and zoom is high enough
    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      // Vertical lines
      for (let px = 0; px <= currentImage.width; px++) {
        const lineX = x + px * zoom;
        ctx.moveTo(lineX, y);
        ctx.lineTo(lineX, y + scaledHeight);
      }
      
      // Horizontal lines
      for (let py = 0; py <= currentImage.height; py++) {
        const lineY = y + py * zoom;
        ctx.moveTo(x, lineY);
        ctx.lineTo(x + scaledWidth, lineY);
      }
      
      ctx.stroke();
    }
  }, [currentImage, zoom, pan, showGrid, showTransparent, editableSti.is_8bit, editableSti.palette]);

  // Handle window resize by redrawing canvas
  useEffect(() => {
    const handleResize = () => {
      drawCanvas();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [drawCanvas]);

  const getPixelCoordinates = (clientX: number, clientY: number): { x: number, y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaledWidth = currentImage.width * zoom;
    const scaledHeight = currentImage.height * zoom;
    const imageX = (canvas.width - scaledWidth) / 2 + pan.x;
    const imageY = (canvas.height - scaledHeight) / 2 + pan.y;

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    const pixelX = Math.floor((canvasX - imageX) / zoom);
    const pixelY = Math.floor((canvasY - imageY) / zoom);

    if (pixelX >= 0 && pixelX < currentImage.width && pixelY >= 0 && pixelY < currentImage.height) {
      return { x: pixelX, y: pixelY };
    }

    return null;
  };

  // Save current state to history
  const saveToHistory = useCallback((actionDescription: string) => {
    if (isHistoryAction) return; // Don't save history actions to history
    
    const newState: HistoryState = {
      editableSti: JSON.parse(JSON.stringify(editableSti)),
      currentImageIndex,
      timestamp: Date.now(),
      actionDescription
    };

    setHistoryState(prevState => {
      // Remove any states after current index (when undoing then making new changes)
      const newHistory = prevState.history.slice(0, prevState.index + 1);
      newHistory.push(newState);

      // Limit history size to prevent memory issues (keep last 50 states)
      let newIndex = newHistory.length - 1;
      if (newHistory.length > 50) {
        newHistory.shift();
        newIndex = 49;
      }

      return {
        history: newHistory,
        index: newIndex
      };
    });
  }, [editableSti, currentImageIndex, isHistoryAction]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    
    const previousState = history[historyIndex - 1];
    setIsHistoryAction(true);
    
    onUpdate(previousState.editableSti);
    onImageChange(previousState.currentImageIndex);
    
    setHistoryState(prev => ({
      ...prev,
      index: prev.index - 1
    }));
    
    setTimeout(() => setIsHistoryAction(false), 0);
  }, [historyIndex, history, onUpdate, onImageChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    const nextState = history[historyIndex + 1];
    setIsHistoryAction(true);
    
    onUpdate(nextState.editableSti);
    onImageChange(nextState.currentImageIndex);
    
    setHistoryState(prev => ({
      ...prev,
      index: prev.index + 1
    }));
    
    setTimeout(() => setIsHistoryAction(false), 0);
  }, [historyIndex, history, onUpdate, onImageChange]);

  const paintPixel = (x: number, y: number) => {
    const newImageData = [...currentImage.data];
    
    if (editableSti.is_8bit) {
      const dataIndex = y * currentImage.width + x;
      if (tool.type === 'brush') {
        newImageData[dataIndex] = selectedColor;
      } else if (tool.type === 'eraser') {
        newImageData[dataIndex] = 0; // Transparent color
      }
    } else {
      // 16-bit RGB565 painting would be more complex
      // For now, simplified implementation
      const dataIndex = (y * currentImage.width + x) * 2;
      if (tool.type === 'brush' && editableSti.palette && selectedColor < editableSti.palette.length) {
        const color = editableSti.palette[selectedColor];
        const r = Math.floor(color[0] / 8);
        const g = Math.floor(color[1] / 4);
        const b = Math.floor(color[2] / 8);
        const rgb565 = (r << 11) | (g << 5) | b;
        newImageData[dataIndex] = rgb565 & 0xFF;
        newImageData[dataIndex + 1] = (rgb565 >> 8) & 0xFF;
      }
    }

    const updatedImage: EditableImage = {
      ...currentImage,
      data: newImageData,
    };

    const updatedSti = {
      ...editableSti,
      images: editableSti.images.map((img, index) =>
        index === currentImageIndex ? updatedImage : img
      ),
    };

    onUpdate(updatedSti);
    setHasUnsavedChanges(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getPixelCoordinates(e.clientX, e.clientY);
    
    if (tool.type === 'pan') {
      // Pan tool always enables dragging
      setIsDragging(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (coords) {
      if (tool.type === 'eyedropper') {
        // Pick color
        if (editableSti.is_8bit) {
          const dataIndex = coords.y * currentImage.width + coords.x;
          setSelectedColor(currentImage.data[dataIndex]);
        }
        return;
      }

      // Start drawing - don't save to history yet, do it after stroke completion
      setIsDrawing(true);
      setStrokeStarted(true);
      paintPixel(coords.x, coords.y);
    } else {
      setIsDragging(true);
    }
    
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing) {
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        paintPixel(coords.x, coords.y);
      }
    } else if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;
      setPan(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    const wasDrawing = isDrawing;
    setIsDrawing(false);
    setIsDragging(false);
    
    // Save the completed stroke to history AFTER it's finished
    if (wasDrawing && strokeStarted && (tool.type === 'brush' || tool.type === 'eraser')) {
      // The state is now complete, save it to history
      saveToHistory(`Completed ${tool.type} stroke`);
    }
    setStrokeStarted(false);
  };

  const handleSave = async () => {
    try {
      await StiEditingApi.saveStiFile(editableSti.file_path, editableSti);
      setHasUnsavedChanges(false);
      onSave();
    } catch (error) {
      console.error('Failed to save STI file:', error);
    }
  };

  const addNewImage = () => {
    // Save state before making changes
    saveToHistory('Before adding new image');
    
    const newImage: EditableImage = {
      width: 64,
      height: 64,
      data: new Array(64 * 64).fill(0), // Fill with transparent color
    };

    const updatedSti = {
      ...editableSti,
      images: [...editableSti.images, newImage],
    };

    onUpdate(updatedSti);
    onImageChange(updatedSti.images.length - 1);
    setHasUnsavedChanges(true);
  };

  const deleteCurrentImage = () => {
    if (editableSti.images.length <= 1) return; // Don't delete the last image

    // Save state before making changes
    saveToHistory(`Before deleting image ${currentImageIndex + 1}`);

    const updatedSti = {
      ...editableSti,
      images: editableSti.images.filter((_, index) => index !== currentImageIndex),
    };

    onUpdate(updatedSti);
    onImageChange(Math.max(0, currentImageIndex - 1));
    setHasUnsavedChanges(true);
  };

  const resetView = () => {
    setZoom(2);
    setPan({ x: 0, y: 0 });
  };

  const fitToWindow = () => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImage) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / currentImage.width;
    const scaleY = rect.height / currentImage.height;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    
    setZoom(Math.max(1, Math.floor(scale)));
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="image-editor">
      <div className="editor-header">
        <div className="editor-info">
          <span>Editing: {editableSti.file_path.split('/').pop()}</span>
          {hasUnsavedChanges && <span className="unsaved-indicator">●</span>}
        </div>
        
        <div className="editor-view-controls">
          {editableSti.is_8bit && (
            <button
              onClick={() => setShowTransparent(!showTransparent)}
              style={{
                backgroundColor: showTransparent ? '#666' : '#007bff',
                color: 'white'
              }}
            >
              {showTransparent ? 'Hide Transparent' : 'Show Transparent'}
            </button>
          )}
          <button
            onClick={() => setShowGrid(!showGrid)}
            style={{
              backgroundColor: showGrid ? '#007bff' : '#666',
              color: 'white'
            }}
          >
            {showGrid ? 'Hide Grid' : 'Show Grid'}
          </button>
          <button onClick={resetView}>Reset</button>
          <button onClick={() => setZoom(Math.max(1, zoom / 2))}>-</button>
          <button onClick={() => setZoom(Math.min(32, zoom * 2))}>+</button>
          <button onClick={fitToWindow}>Fit</button>
          <span className="zoom-info">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="editor-history-controls">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl/Cmd+Z)"
            className="history-button"
          >
            ↶ Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl/Cmd+Y)"
            className="history-button"
          >
            ↷ Redo
          </button>
          <span className="history-info">
            {history.length > 0 ? `${historyIndex + 1}/${history.length}` : '0/0'}
          </span>
        </div>

        <div className="editor-actions">
          <button onClick={handleSave} disabled={!hasUnsavedChanges}>
            Save
          </button>
          <button onClick={onCancel}>
            {hasUnsavedChanges ? 'Cancel' : 'Exit Edit Mode'}
          </button>
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-sidebar">
          <div className="tool-panel">
            <h3>Tools</h3>
            <div className="tools">
              <button
                className={tool.type === 'brush' ? 'active' : ''}
                onClick={() => setTool({ ...tool, type: 'brush' })}
              >
                🖌️ Brush
              </button>
              <button
                className={tool.type === 'eraser' ? 'active' : ''}
                onClick={() => setTool({ ...tool, type: 'eraser' })}
              >
                🧹 Eraser
              </button>
              <button
                className={tool.type === 'eyedropper' ? 'active' : ''}
                onClick={() => setTool({ ...tool, type: 'eyedropper' })}
              >
                💉 Eyedropper
              </button>
              <button
                className={tool.type === 'pan' ? 'active' : ''}
                onClick={() => setTool({ ...tool, type: 'pan' })}
              >
                ✋ Pan
              </button>
            </div>
          </div>

          {editableSti.is_8bit && editableSti.palette && (
            <div className="palette-panel">
              <h3>Palette</h3>
              <div className="palette-grid">
                {editableSti.palette.map((color, index) => (
                  <button
                    key={index}
                    className={`palette-color ${selectedColor === index ? 'selected' : ''}`}
                    style={{
                      backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                    }}
                    onClick={() => setSelectedColor(index)}
                    title={`Color ${index}: RGB(${color[0]}, ${color[1]}, ${color[2]})`}
                  />
                ))}
              </div>
            </div>
          )}


          <div className="image-management">
            <h3>Images</h3>
            <div className="image-list">
              {editableSti.images.map((img, index) => (
                <button
                  key={index}
                  className={`image-item ${index === currentImageIndex ? 'active' : ''}`}
                  onClick={() => onImageChange(index)}
                >
                  Image {index + 1} ({img.width}x{img.height})
                </button>
              ))}
            </div>
            <div className="image-actions">
              <button onClick={addNewImage}>Add New</button>
              <button 
                onClick={deleteCurrentImage}
                disabled={editableSti.images.length <= 1}
              >
                Delete Current
              </button>
            </div>
          </div>
        </div>

        <div className="editor-canvas-container">
          <canvas
            ref={canvasRef}
            className={`editor-canvas ${tool.type === 'pan' ? 'pan-cursor' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </div>
    </div>
  );
};

export default ImageEditor;