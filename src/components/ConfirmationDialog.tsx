import React, { useState } from 'react';
import './ConfirmationDialog.css';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  riskLevel?: 'low' | 'medium' | 'high'; // Keep for backwards compatibility but ignore
  previewData?: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  previewData,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="confirmation-dialog-overlay">
      <div className="confirmation-dialog">
        <div className="confirmation-header">
          <h3 className="confirmation-title">{title}</h3>
        </div>

        <div className="confirmation-content">
          <p className="confirmation-message">{message}</p>
          
          {previewData && previewData.length > 0 && (
            <div className="preview-section">
              <h4>Details:</h4>
              <ul className="preview-list">
                {previewData.map((item, index) => (
                  <li key={index} className="preview-item">{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="confirmation-actions">
          <button
            className="cancel-button"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelText}
          </button>
          <button
            className="confirm-button"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;