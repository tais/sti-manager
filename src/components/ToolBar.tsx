import React from 'react';

interface ToolBarProps {
  onToggleSidebar: () => void;
  onExport: () => void;
  onEnterEditMode?: () => void;
  canExport: boolean;
  canEdit?: boolean;
  loading: boolean;
}

const ToolBar: React.FC<ToolBarProps> = ({
  onToggleSidebar,
  onExport,
  onEnterEditMode,
  canExport,
  canEdit,
  loading
}) => {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button
          onClick={onToggleSidebar}
          className="toolbar-button-menu"
          title="Toggle Sidebar"
        >
          ☰
        </button>
      </div>
      
      <div className="toolbar-section toolbar-title">
      </div>
      
      <div className="toolbar-section">
        {canEdit && onEnterEditMode && (
          <button
            onClick={onEnterEditMode}
            disabled={loading}
            className="toolbar-button"
            title="Enter Edit Mode"
          >
            ✏️ Edit
          </button>
        )}
        
        {canExport && (
          <button
            onClick={onExport}
            disabled={loading}
            className="toolbar-button"
            title="Export Images"
          >
            📤 Export
          </button>
        )}
      </div>
    </div>
  );
};

export default ToolBar;