import React from 'react';

interface ToolBarProps {
  onToggleSidebar: () => void;
  onExport: () => void;
  onImport?: () => void;
  onEnterEditMode?: () => void;
  canExport: boolean;
  canImport?: boolean;
  canEdit?: boolean;
  loading: boolean;
  // Image management props
  showImageManagement?: boolean;
  managementMode?: boolean;
  multiSelectMode?: boolean;
  onToggleManagement?: () => void;
  onToggleMultiSelect?: () => void;
}

const ToolBar: React.FC<ToolBarProps> = ({
  onToggleSidebar,
  onExport,
  onImport,
  onEnterEditMode,
  canExport,
  canImport,
  canEdit,
  loading,
  showImageManagement,
  managementMode,
  multiSelectMode,
  onToggleManagement,
  onToggleMultiSelect
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
        {showImageManagement && onToggleMultiSelect && managementMode && (
          <button
            onClick={onToggleMultiSelect}
            disabled={loading}
            className={`toolbar-button ${multiSelectMode ? 'active' : ''}`}
            title={multiSelectMode ? 'Exit multi-select mode' : 'Enter multi-select mode'}
          >
            {multiSelectMode ? 'Select' : 'Select'}
          </button>
        )}
        
        {showImageManagement && onToggleManagement && (
          <button
            onClick={onToggleManagement}
            disabled={loading}
            className={`toolbar-button ${managementMode ? 'active' : ''}`}
            title={managementMode ? 'Exit management mode' : 'Enter management mode'}
          >
            {managementMode ? 'Manage' : 'Manage'}
          </button>
        )}
        
        {canEdit && onEnterEditMode && (
          <button
            onClick={onEnterEditMode}
            disabled={loading}
            className="toolbar-button"
            title="Enter Edit Mode"
          >
            Edit Mode
          </button>
        )}
        
        {canImport && onImport && (
          <button
            onClick={onImport}
            disabled={loading}
            className="toolbar-button"
            title="Import Image"
          >
            Import
          </button>
        )}
        
        {canExport && (
          <button
            onClick={onExport}
            disabled={loading}
            className="toolbar-button"
            title="Export Images"
          >
            Export
          </button>
        )}
      </div>
    </div>
  );
};

export default ToolBar;