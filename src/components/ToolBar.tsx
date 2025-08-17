import React from 'react';

interface ToolBarProps {
  onToggleSidebar: () => void;
  onExport: (format: string) => void;
  canExport: boolean;
  loading: boolean;
}

const ToolBar: React.FC<ToolBarProps> = ({
  onToggleSidebar,
  onExport,
  canExport,
  loading
}) => {
  const exportFormats = ['PNG', 'JPEG', 'BMP'];

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button 
          onClick={onToggleSidebar}
          className="toolbar-button"
          title="Toggle Sidebar"
        >
          ☰
        </button>
      </div>
      
      <div className="toolbar-section toolbar-title">
        <h1>STI Manager</h1>
      </div>
      
      <div className="toolbar-section">
        {canExport && (
          <div className="export-dropdown">
            <select 
              onChange={(e) => e.target.value && onExport(e.target.value)}
              disabled={loading}
              className="toolbar-select"
              defaultValue=""
            >
              <option value="" disabled>Export as...</option>
              {exportFormats.map(format => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolBar;