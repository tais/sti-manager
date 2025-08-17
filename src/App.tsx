import { useState } from 'react';
import './App.css';
import { StiFileInfo, StiImageData, StiMetadata } from './types/sti';
import { StiApi } from './services/api';
import FileExplorer from './components/FileExplorer';
import ImageViewer from './components/ImageViewer';
import MetadataPanel from './components/MetadataPanel';
import ToolBar from './components/ToolBar';

interface AppState {
  currentFile: string | null;
  fileInfo: StiFileInfo | null;
  currentImageIndex: number;
  imageData: StiImageData | null;
  metadata: StiMetadata | null;
  loading: boolean;
  error: string | null;
  sidebarVisible: boolean;
}

function App() {
  const [state, setState] = useState<AppState>({
    currentFile: null,
    fileInfo: null,
    currentImageIndex: 0,
    imageData: null,
    metadata: null,
    loading: false,
    error: null,
    sidebarVisible: true,
  });

  const handleFileSelect = async (filePath: string) => {
    if (filePath === state.currentFile) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Open the STI file and get basic info
      const fileInfo = await StiApi.openStiFile(filePath);
      
      // Get the first image
      const imageData = await StiApi.getStiImage(filePath, 0);
      
      // Get metadata
      const metadata = await StiApi.getStiMetadata(filePath);

      setState(prev => ({
        ...prev,
        currentFile: filePath,
        fileInfo,
        currentImageIndex: 0,
        imageData,
        metadata,
        loading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false,
      }));
    }
  };

  const handleImageIndexChange = async (newIndex: number) => {
    if (!state.currentFile || !state.fileInfo || newIndex === state.currentImageIndex) return;
    
    if (newIndex < 0 || newIndex >= state.fileInfo.num_images) return;

    setState(prev => ({ ...prev, loading: true }));

    try {
      const imageData = await StiApi.getStiImage(state.currentFile!, newIndex);
      setState(prev => ({
        ...prev,
        currentImageIndex: newIndex,
        imageData,
        loading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load image',
        loading: false,
      }));
    }
  };

  const handleExport = async (format: string) => {
    if (!state.currentFile || state.imageData === null) return;

    try {
      // This would open a save dialog in a real implementation
      const outputPath = `/tmp/exported_image.${format.toLowerCase()}`;
      await StiApi.exportImage(state.currentFile, state.currentImageIndex, outputPath, format);
      console.log(`Image exported to ${outputPath}`);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Export failed',
      }));
    }
  };

  const toggleSidebar = () => {
    setState(prev => ({ ...prev, sidebarVisible: !prev.sidebarVisible }));
  };

  return (
    <div className="app">
      <ToolBar 
        onToggleSidebar={toggleSidebar}
        onExport={handleExport}
        canExport={state.imageData !== null}
        loading={state.loading}
      />
      
      <div className="app-body">
        {state.sidebarVisible && (
          <div className="sidebar">
            <FileExplorer onFileSelect={handleFileSelect} />
            {state.metadata && (
              <MetadataPanel 
                fileInfo={state.fileInfo}
                metadata={state.metadata}
              />
            )}
          </div>
        )}
        
        <div className="main-content">
          {state.error && (
            <div className="error-message">
              Error: {state.error}
            </div>
          )}
          
          {state.loading && (
            <div className="loading-message">
              Loading...
            </div>
          )}
          
          {state.imageData && state.fileInfo && !state.loading && (
            <ImageViewer
              imageData={state.imageData}
              fileInfo={state.fileInfo}
              currentIndex={state.currentImageIndex}
              onImageIndexChange={handleImageIndexChange}
            />
          )}
          
          {!state.currentFile && !state.loading && (
            <div className="welcome-message">
              <h2>STI Manager</h2>
              <p>Select an STI file from the file explorer to get started.</p>
              <div className="file-info">
                <h3>Supported Features:</h3>
                <ul>
                  <li>View 8-bit and 16-bit STI images</li>
                  <li>Browse animated sequences</li>
                  <li>View file metadata</li>
                  <li>Export to PNG, JPEG, BMP</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
