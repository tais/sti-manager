import React, { useState, useRef, useEffect } from 'react';
import { StiFileInfo, StiImageData } from '../types/sti';
import './ImageViewer.css';

interface ImageViewerProps {
  imageData: StiImageData;
  fileInfo: StiFileInfo;
  currentIndex: number;
  onImageIndexChange: (index: number) => void;
}

// Global values that persist across image changes
let persistentZoom = 2;
let persistentShowTransparent = true;

const ImageViewer: React.FC<ImageViewerProps> = ({
  imageData,
  fileInfo,
  currentIndex,
  onImageIndexChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(persistentZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [showTransparent, setShowTransparent] = useState(persistentShowTransparent);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Update the persistent values whenever local values change
  useEffect(() => {
    persistentZoom = zoom;
  }, [zoom]);

  useEffect(() => {
    persistentShowTransparent = showTransparent;
  }, [showTransparent]);

  useEffect(() => {
    drawImage();
  }, [imageData, zoom, pan, showTransparent, canvasSize]);

  // Handle canvas resizing
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    // Initial size
    updateCanvasSize();

    // Add resize observer
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    const canvas = canvasRef.current;
    if (canvas) {
      resizeObserver.observe(canvas.parentElement!);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const drawImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData || canvasSize.width === 0 || canvasSize.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size only if it has changed
    if (canvas.width !== canvasSize.width || canvas.height !== canvasSize.height) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create ImageData
    const imageDataArray = new ImageData(imageData.width, imageData.height);
    
    if (fileInfo.is_8bit && imageData.palette) {
      // Convert 8-bit indexed to RGB
      for (let i = 0; i < imageData.data.length; i++) {
        const paletteIndex = imageData.data[i];
        const color = imageData.palette[paletteIndex] || [0, 0, 0];
        const pixelIndex = i * 4;
        imageDataArray.data[pixelIndex] = color[0];     // R
        imageDataArray.data[pixelIndex + 1] = color[1]; // G
        imageDataArray.data[pixelIndex + 2] = color[2]; // B
        
        // Handle transparency - first palette color (index 0) is usually transparent blue
        if (paletteIndex === 0 && !showTransparent) {
          imageDataArray.data[pixelIndex + 3] = 0; // Fully transparent
        } else {
          imageDataArray.data[pixelIndex + 3] = 255; // Fully opaque
        }
      }
    } else {
      // 16-bit RGB565 or direct RGB data
      for (let i = 0; i < imageData.data.length; i += 2) {
        if (i + 1 < imageData.data.length) {
          const rgb565 = (imageData.data[i + 1] << 8) | imageData.data[i];
          const r = ((rgb565 >> 11) & 0x1F) << 3;
          const g = ((rgb565 >> 5) & 0x3F) << 2;
          const b = (rgb565 & 0x1F) << 3;
          
          const pixelIndex = (i / 2) * 4;
          imageDataArray.data[pixelIndex] = r;
          imageDataArray.data[pixelIndex + 1] = g;
          imageDataArray.data[pixelIndex + 2] = b;
          imageDataArray.data[pixelIndex + 3] = 255;
        }
      }
    }

    // Create temporary canvas for the image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageDataArray, 0, 0);

      // Draw the image with zoom and pan
      const scaledWidth = imageData.width * zoom;
      const scaledHeight = imageData.height * zoom;
      const x = (canvas.width - scaledWidth) / 2 + pan.x;
      const y = (canvas.height - scaledHeight) / 2 + pan.y;

      ctx.imageSmoothingEnabled = false; // Pixel art should be crisp
      ctx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    
    setPan(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
    
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(100, zoom * zoomFactor));
    setZoom(newZoom);
    persistentZoom = newZoom;
  };

  const resetView = () => {
    setZoom(2);
    persistentZoom = 1;
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    const newZoom = Math.min(100, zoom * 2);
    setZoom(newZoom);
    persistentZoom = newZoom;
    setPan({ x: 0, y: 0 });
  };

  const zoomOut = () => {
    const newZoom = Math.max(0.1, zoom / 2);
    setZoom(newZoom);
    persistentZoom = newZoom;
    setPan({ x: 0, y: 0 });
  };

  const fitToWindow = () => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return;

    const scaleX = canvasSize.width / imageData.width;
    const scaleY = canvasSize.height / imageData.height;
    const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some margin
    
    setZoom(scale);
    persistentZoom = scale;
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="image-viewer">
      <div className="image-viewer-header">
        <div className="image-info">
          <span>
            {imageData.width} x {imageData.height} / 
            {fileInfo.is_8bit ? ' 8-bit' : ' 16-bit'} / 
            Image {currentIndex + 1} of {fileInfo.num_images}
          </span>
        </div>
        
        <div className="view-controls">
          <button onClick={resetView}>Reset</button>
          <button onClick={zoomIn}>+</button>
          <button onClick={zoomOut}>-</button>
          <button onClick={fitToWindow}>Fit</button>
          {fileInfo.is_8bit && (
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
          <span className="zoom-info">Zoom: {Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="image-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>

      {fileInfo.num_images > 1 && (
        <div className="animation-controls">
          <button 
            onClick={() => onImageIndexChange(0)}
            disabled={currentIndex === 0}
          >
            First
          </button>
          
          <button 
            onClick={() => onImageIndexChange(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            ← Prev
          </button>
          
          <span className="frame-counter">
            Frame {currentIndex + 1} / {fileInfo.num_images}
          </span>
          
          <button 
            onClick={() => onImageIndexChange(currentIndex + 1)}
            disabled={currentIndex === fileInfo.num_images - 1}
          >
            Next →
          </button>

          <button 
            onClick={() => onImageIndexChange(fileInfo.num_images - 1)}
            disabled={currentIndex === fileInfo.num_images - 1}
          >
            Last
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageViewer;