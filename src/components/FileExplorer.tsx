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

  const handleSelectRootDirectory = async () => {
    try {
      setError(null);
      const selectedPath = await DirectoryApi.selectDirectory();
      if (selectedPath) {
        setRootDirectory(selectedPath);
        setCurrentPath(selectedPath);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setDirectoryContents(null);
    } finally {
      setLoading(false);
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


  const getRelativePath = (fullPath: string) => {
    if (!rootDirectory) return fullPath;
    return fullPath.startsWith(rootDirectory) 
      ? fullPath.substring(rootDirectory.length) || '/'
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
            </div>
            {item.is_sti_file && (
              <div className="sti-badge">STI</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileExplorer;