import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { DirectoryApi } from '../services/api';
import { DirectoryContents, DirectoryItem } from '../types/sti';
import './FileExplorer.css';

interface FileExplorerProps {
  onFileSelect: (filePath: string) => void;
  rootDirectory?: string | null;
  currentPath?: string | null;
  selectedFile?: string | null;
  onRootDirectoryChange?: (rootDirectory: string | null) => void;
  onCurrentPathChange?: (currentPath: string | null) => void;
}

export interface FileExplorerHandle {
  refresh: () => void;
}

const FileExplorer = forwardRef<FileExplorerHandle, FileExplorerProps>(({
  onFileSelect,
  rootDirectory: propRootDirectory,
  currentPath: propCurrentPath,
  selectedFile,
  onRootDirectoryChange,
  onCurrentPathChange
}, ref) => {
  const [rootDirectory, setRootDirectory] = useState<string | null>(propRootDirectory || null);
  const [currentPath, setCurrentPath] = useState<string>(propCurrentPath || propRootDirectory || '');
  const [directoryContents, setDirectoryContents] = useState<DirectoryContents | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileListRef = React.useRef<HTMLDivElement>(null);

  // Initial load when component mounts with existing rootDirectory and currentPath
  React.useEffect(() => {
    if (propRootDirectory && !directoryContents) {
      setRootDirectory(propRootDirectory);
      const pathToLoad = propCurrentPath || propRootDirectory;
      setCurrentPath(pathToLoad);
      loadDirectory(pathToLoad);
    }
  }, [propRootDirectory, propCurrentPath]);

  // Sync with parent prop changes
  React.useEffect(() => {
    if (propRootDirectory && propRootDirectory !== rootDirectory) {
      setRootDirectory(propRootDirectory);
      setCurrentPath(propRootDirectory);
      loadDirectory(propRootDirectory);
    }
  }, [propRootDirectory, rootDirectory]);

  const handleSelectRootDirectory = async () => {
    try {
      setError(null);
      const selectedPath = await DirectoryApi.selectDirectory();
      if (selectedPath) {
        setRootDirectory(selectedPath);
        setCurrentPath(selectedPath);
        if (onRootDirectoryChange) {
          onRootDirectoryChange(selectedPath);
        }
        await loadDirectory(selectedPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select directory');
    }
  };

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const contents = await DirectoryApi.browseDirectory(path);
      setDirectoryContents(contents);
      setCurrentPath(path);
      if (onCurrentPathChange) {
        onCurrentPathChange(path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setDirectoryContents(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshDirectory = async () => {
    if (currentPath) {
      await loadDirectory(currentPath);
    }
  };

  // Expose refresh function to parent component
  useImperativeHandle(ref, () => ({
    refresh: handleRefreshDirectory
  }), [handleRefreshDirectory]);

  // Scroll to selected file when directory contents change or selected file changes
  React.useEffect(() => {
    if (selectedFile && directoryContents && !loading) {
      const scrollToSelectedFile = () => {
        const fileListElement = fileListRef.current;
        if (!fileListElement) return;

        // Find the selected file element
        const selectedElement = fileListElement.querySelector(`[data-file-path="${selectedFile}"]`) as HTMLElement;
        if (selectedElement) {
          // Scroll the selected element into view
          selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      };

      // Small delay to ensure DOM is updated
      setTimeout(scrollToSelectedFile, 100);
    }
  }, [selectedFile, directoryContents, loading]);


  const handleItemClick = async (item: DirectoryItem) => {
    if (item.is_directory) {
      await loadDirectory(item.path);
    } else if (item.is_sti_file) {
      onFileSelect(item.path);
    }
  };

  const handleBackClick = async () => {
    if (directoryContents?.parent_path && directoryContents.parent_path !== currentPath) {
      // Prevent navigating outside the root directory
      if (rootDirectory && directoryContents.parent_path.length >= rootDirectory.length &&
          directoryContents.parent_path.startsWith(rootDirectory)) {
        await loadDirectory(directoryContents.parent_path);
      }
    }
  };


  const getRelativePath = (fullPath: string) => {
    if (!rootDirectory) return fullPath;
    if (fullPath === rootDirectory) return '/';
    return fullPath.startsWith(rootDirectory)
      ? fullPath.substring(rootDirectory.length).replace(/^\/+/, '/') || '/'
      : fullPath;
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        {!rootDirectory ? (
          <div className="directory-selection">
            <button onClick={handleSelectRootDirectory} className="select-directory-btn">
              📁 Select Root Directory
            </button>
            <p className="helper-text">Choose a directory containing STI files</p>
          </div>
        ) : (
          <div className="directory-info">
            <div className="path-bar">
              <button
                onClick={handleBackClick}
                disabled={
                  !directoryContents?.parent_path ||
                  loading ||
                  !rootDirectory ||
                  directoryContents.parent_path.length < rootDirectory.length ||
                  !directoryContents.parent_path.startsWith(rootDirectory)
                }
                title="Go back"
              >
                ←
              </button>
              <span className="current-path" title={currentPath}>
                {getRelativePath(currentPath)}
              </span>
              <button
                onClick={handleRefreshDirectory}
                className="refresh-btn"
                title="Refresh directory"
                disabled={loading}
              >
                🔄
              </button>
              <button
                onClick={handleSelectRootDirectory}
                className="change-root-btn"
                title="Change root directory"
              >
                📁
              </button>
            </div>
            
            {directoryContents && (
              <div className="directory-stats">
                <span className="sti-count">
                  {directoryContents.sti_count} STI files in current folder
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="file-list" ref={fileListRef}>
        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
        
        {loading && (
          <div className="loading">Loading directory...</div>
        )}
        
        {!loading && !error && directoryContents && directoryContents.items.length === 0 && (
          <div className="empty-directory">
            No files or folders found in this directory.
          </div>
        )}
        
        {!loading && !error && directoryContents && directoryContents.items.map((item) => (
          <div
            key={item.path}
            data-file-path={item.path}
            className={`file-item ${item.is_directory ? 'directory' : 'file'} ${item.is_sti_file ? 'sti-file' : ''} ${selectedFile === item.path ? 'selected' : ''}`}
            onClick={() => handleItemClick(item)}
            title={item.path}
          >
            <div className="file-icon">
              {item.is_directory ? '📁' : item.is_sti_file ? '🎮' : '📄'}
            </div>
            <div className="file-info">
              <div className="file-name">{item.name}</div>
            </div>
            {item.is_sti_file && (
              <div className="sti-badge">STI</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default FileExplorer;