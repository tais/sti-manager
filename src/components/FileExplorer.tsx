import React, { useState, useEffect } from 'react';
import './FileExplorer.css';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

interface FileExplorerProps {
  onFileSelect: (filePath: string) => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ onFileSelect }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading] = useState(false);

  // Updated to include the actual SMP1ITEMS.STI file for testing
  useEffect(() => {
    const testFiles: FileItem[] = [
      { name: 'SMP1ITEMS.STI', path: './SMP1ITEMS.STI', isDirectory: false, size: 2048 },
      { name: 'gun129.sti', path: './gun129.sti', isDirectory: false, size: 2048 },
      { name: 'METLDOOR.STI', path: './METLDOOR.STI', isDirectory: false, size: 2048 },
      { name: 'DOOR_02.STI', path: './DOOR_02.STI', isDirectory: false, size: 2048 },
      { name: 'sample1.sti', path: '/sample1.sti', isDirectory: false, size: 1024 },
      { name: 'sample2.sti', path: '/sample2.sti', isDirectory: false, size: 2048 },
      { name: 'animations', path: '/animations', isDirectory: true },
      { name: 'terrain', path: '/terrain', isDirectory: true },
      { name: 'items', path: '/items', isDirectory: true },
    ];
    setFiles(testFiles);
  }, [currentPath]);

  const handleFileClick = (file: FileItem) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
    } else if (file.name.toLowerCase().endsWith('.sti')) {
      onFileSelect(file.path);
    }
  };

  const handleBackClick = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <h3>File Explorer</h3>
        <div className="path-bar">
          <button onClick={handleBackClick} disabled={currentPath === '/'}>
            ←
          </button>
          <span>{currentPath}</span>
        </div>
      </div>
      
      <div className="file-list">
        {loading ? (
          <div className="loading">Loading files...</div>
        ) : (
          files.map((file) => (
            <div
              key={file.path}
              className={`file-item ${file.isDirectory ? 'directory' : 'file'}`}
              onClick={() => handleFileClick(file)}
            >
              <div className="file-icon">
                {file.isDirectory ? '📁' : '🖼️'}
              </div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                {!file.isDirectory && file.size && (
                  <div className="file-size">{formatFileSize(file.size)}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FileExplorer;