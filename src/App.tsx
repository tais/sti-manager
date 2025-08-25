import { useState } from 'react';
import './App.css';
import { StiFileInfo, StiImageData, StiMetadata, EditableStiFile } from './types/sti';
import { StiApi, StiEditingApi, DirectoryApi } from './services/api';
import FileExplorer from './components/FileExplorer';
import ImageViewer from './components/ImageViewer';
import ImageEditor from './components/ImageEditor';
import MetadataPanel from './components/MetadataPanel';
import ToolBar from './components/ToolBar';
import ImageList from './components/ImageList';

interface AppState {
  currentFile: string | null;
  fileInfo: StiFileInfo | null;
  currentImageIndex: number;
  imageData: StiImageData | null;
  metadata: StiMetadata | null;
  loading: boolean;
  error: string | null;
  sidebarVisible: boolean;
  imageListVisible: boolean;
  isEditMode: boolean;
  editableSti: EditableStiFile | null;
  rootDirectory: string | null;
  currentPath: string | null;
  selectedImages: number[];
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
    imageListVisible: true,
    isEditMode: false,
    editableSti: null,
    rootDirectory: null,
    currentPath: null,
    selectedImages: [],
  });

  const handleFileSelect = async (filePath: string, forceReload = false) => {
    if (filePath === state.currentFile && !forceReload) return;
    if (state.isEditMode) return; // Block file selection during edit mode

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
        isEditMode: false,
        editableSti: null,
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

  const handleEnterEditMode = async () => {
    if (!state.currentFile) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const editableSti = await StiEditingApi.enterEditMode(state.currentFile!);
      setState(prev => ({
        ...prev,
        isEditMode: true,
        editableSti,
        loading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to enter edit mode',
        loading: false,
      }));
    }
  };

  const handleExitEditMode = () => {
    setState(prev => ({
      ...prev,
      isEditMode: false,
      editableSti: null,
    }));
  };

  const handleSaveEdit = async () => {
    // After saving, exit edit mode and refresh the file
    const currentIndex = state.currentImageIndex; // Preserve current image index
    const currentFilePath = state.currentFile;
    
    if (!currentFilePath) return;
    
    // Set loading state immediately
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Explicitly clear the backend cache before reloading
      await DirectoryApi.clearStiCache();
      
      // Add a delay to ensure cache clearing is complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Re-load the file info first
      const fileInfo = await StiApi.openStiFile(currentFilePath);
      
      // Load the specific image we were editing, or fallback to index 0
      const targetIndex = Math.min(currentIndex, fileInfo.num_images - 1);
      const imageData = await StiApi.getStiImage(currentFilePath, targetIndex);
      
      // Get fresh metadata
      const metadata = await StiApi.getStiMetadata(currentFilePath);
      
      // Update state with fresh data and exit edit mode
      setState(prev => ({
        ...prev,
        currentFile: currentFilePath,
        fileInfo,
        currentImageIndex: targetIndex,
        imageData,
        metadata,
        loading: false,
        isEditMode: false,
        editableSti: null,
      }));
      
    } catch (error) {
      console.error('Failed to reload after save:', error);
      // Fallback to exit edit mode and show error
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to reload after save',
        loading: false,
        isEditMode: false,
        editableSti: null,
      }));
    }
  };

  const handleUpdateEditableSti = (updatedSti: EditableStiFile) => {
    setState(prev => ({
      ...prev,
      editableSti: updatedSti,
    }));
  };

  const handleEditImageChange = (index: number) => {
    setState(prev => ({
      ...prev,
      currentImageIndex: index,
    }));
  };

  const toggleSidebar = () => {
    setState(prev => ({ ...prev, sidebarVisible: !prev.sidebarVisible }));
  };

  const toggleImageList = () => {
    setState(prev => ({ ...prev, imageListVisible: !prev.imageListVisible }));
  };

  const handleImageSelect = async (index: number) => {
    await handleImageIndexChange(index);
  };

  const handleImageToggleSelect = (index: number) => {
    setState(prev => ({
      ...prev,
      selectedImages: prev.selectedImages.includes(index)
        ? prev.selectedImages.filter(i => i !== index)
        : [...prev.selectedImages, index]
    }));
  };

  const handleClearSelection = () => {
    setState(prev => ({ ...prev, selectedImages: [] }));
  };

  const handleRootDirectoryChange = (rootDirectory: string | null) => {
    setState(prev => ({ ...prev, rootDirectory }));
  };

  const handleCurrentPathChange = (currentPath: string | null) => {
    setState(prev => ({ ...prev, currentPath }));
  };

  return (
    <div className="app">
      {!state.isEditMode ? (
        <>
          <ToolBar
            onToggleSidebar={toggleSidebar}
            onExport={handleExport}
            onEnterEditMode={handleEnterEditMode}
            canExport={state.imageData !== null}
            canEdit={state.currentFile !== null && !state.loading}
            loading={state.loading}
          />
          
          <div className="app-body">
            {state.sidebarVisible && (
              <div className="sidebar">
                <FileExplorer
                  onFileSelect={handleFileSelect}
                  rootDirectory={state.rootDirectory}
                  currentPath={state.currentPath}
                  selectedFile={state.currentFile}
                  onRootDirectoryChange={handleRootDirectoryChange}
                  onCurrentPathChange={handleCurrentPathChange}
                />
                {state.metadata && (
                  <MetadataPanel
                    fileInfo={state.fileInfo}
                    metadata={state.metadata}
                  />
                )}
              </div>
            )}
            
            <div className="main-content">
              <div className="content-area">
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
                        <li>Edit images with palette-based tools</li>
                        <li>Add, delete, and reorder images</li>
                        <li>View file metadata</li>
                        <li>Export to PNG, JPEG, BMP</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {state.imageListVisible && state.fileInfo && state.fileInfo.num_images > 1 && (
                <ImageList
                  fileInfo={state.fileInfo}
                  currentFile={state.currentFile!}
                  currentIndex={state.currentImageIndex}
                  selectedImages={state.selectedImages}
                  onImageSelect={handleImageSelect}
                  onImageToggleSelect={handleImageToggleSelect}
                  onClearSelection={handleClearSelection}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        state.editableSti && (
          <ImageEditor
            editableSti={state.editableSti}
            currentImageIndex={state.currentImageIndex}
            onImageChange={handleEditImageChange}
            onSave={handleSaveEdit}
            onCancel={handleExitEditMode}
            onUpdate={handleUpdateEditableSti}
          />
        )
      )}
    </div>
  );
}

export default App;
