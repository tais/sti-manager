import React, { useState, useEffect } from 'react';
import { DirectoryApi } from '../services/api';
import { DirectoryContents, DirectoryItem } from '../types/sti';
import './FileExplorer.css';

interface FileExplorerProps {
  onFileSelect: (filePath: string) => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ onFileSelect }) => {
  const [rootDirectory, setRootDirectory] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [directoryContents, setDirectoryContents] = useState<DirectoryContents | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stiFiles, setStiFiles] = useState<string[]>([]);
  const [scanningForSti, setScanningForSti] = useState(false);

  const handleSelectRootDirectory = async () => {
    try {
      setError(null);
      const selectedPath = await DirectoryApi.selectDirectory();
      if (selectedPath) {
        setRootDirectory(selectedPath);
        setCurrentPath(selectedPath);
        await loadDirectory(selectedPath);
        await scanForStiFiles(selectedPath);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setDirectoryContents(null);
    } finally {
      setLoading(false);
    }
  };

  const scanForStiFiles = async (path: string) => {
    setScanningForSti(true);
    try {
      const files = await DirectoryApi.scanForStiFiles(path, true);
      setStiFiles(files);
    } catch (err) {
      console.error('Failed to scan for STI files:', err);
    } finally {
      setScanningForSti(false);
    }
  };

  const handleItemClick = async (item: DirectoryItem) => {
    if (item.is_directory) {
      await loadDirectory(item.path);
    } else if (item.is_sti_file) {
      onFileSelect(item.path);
    }
  };

  const handleBackClick = async () => {
    if (directoryContents?.parent_path && directoryContents.parent_path !== currentPath) {
      await loadDirectory(directoryContents.parent_path);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getRelativePath = (fullPath: string) => {
    if (!rootDirectory) return fullPath;
    return fullPath.startsWith(rootDirectory) 
      ? fullPath.substring(rootDirectory.length) || '/'
      : fullPath;
  };

  // Auto-select a default directory on mount (for development)
  useEffect(() => {
    // For development, we can start with current directory
    // In production, user will need to select a directory
    const defaultPath = '.';
    if (!rootDirectory) {
      setRootDirectory(defaultPath);
      setCurrentPath(defaultPath);
      loadDirectory(defaultPath);
    }
  }, []);

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <h3>STI File Explorer</h3>
        
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
                disabled={!directoryContents?.parent_path || loading}
                title="Go back"
              >
                ←
              </button>
              <span className="current-path" title={currentPath}>
                {getRelativePath(currentPath)}
              </span>
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
                {scanningForSti && <span className="scanning">Scanning...</span>}
                {!scanningForSti && stiFiles.length > 0 && (
                  <span className="total-sti">
                    {stiFiles.length} STI files total
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="file-list">
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
            className={`file-item ${item.is_directory ? 'directory' : 'file'} ${item.is_sti_file ? 'sti-file' : ''}`}
            onClick={() => handleItemClick(item)}
            title={item.path}
          >
            <div className="file-icon">
              {item.is_directory ? '📁' : item.is_sti_file ? '🎮' : '📄'}
            </div>
            <div className="file-info">
              <div className="file-name">{item.name}</div>
              {!item.is_directory && item.size && (
                <div className="file-size">{formatFileSize(item.size)}</div>
              )}
              {item.is_directory && (
                <div className="directory-indicator">folder</div>
              )}
            </div>
            {item.is_sti_file && (
              <div className="sti-badge">STI</div>
            )}
          </div>
        ))}
      </div>
      
      {stiFiles.length > 0 && (
        <div className="sti-files-summary">
          <details>
            <summary>All STI Files ({stiFiles.length})</summary>
            <div className="sti-files-list">
              {stiFiles.map((filePath) => (
                <div
                  key={filePath}
                  className="sti-file-item"
                  onClick={() => onFileSelect(filePath)}
                  title={filePath}
                >
                  🎮 {filePath.split('/').pop() || filePath}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;