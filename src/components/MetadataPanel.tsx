import React from 'react';
import { StiFileInfo, StiMetadata } from '../types/sti';
import './MetadataPanel.css';

interface MetadataPanelProps {
  fileInfo: StiFileInfo | null;
  metadata: StiMetadata;
}

const MetadataPanel: React.FC<MetadataPanelProps> = ({ fileInfo, metadata }) => {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatSignature = (sig: number[]) => {
    return sig.map(b => String.fromCharCode(b)).join('');
  };

  return (
    <div className="metadata-panel">
      <h3>File Information</h3>
      
      <div className="metadata-section">
        <h4>Basic Info</h4>
        <div className="metadata-row">
          <span className="label">Signature:</span>
          <span className="value">{formatSignature(metadata.signature)}</span>
        </div>
        <div className="metadata-row">
          <span className="label">Dimensions:</span>
          <span className="value">{metadata.width} × {metadata.height}</span>
        </div>
        <div className="metadata-row">
          <span className="label">Color Depth:</span>
          <span className="value">{metadata.color_depth} bit</span>
        </div>
        <div className="metadata-row">
          <span className="label">Images:</span>
          <span className="value">{metadata.num_images}</span>
        </div>
        {fileInfo && (
          <div className="metadata-row">
            <span className="label">File Size:</span>
            <span className="value">{formatBytes(fileInfo.file_size)}</span>
          </div>
        )}
      </div>

      <div className="metadata-section">
        <h4>Format Flags</h4>
        <div className="flags-grid">
          <div className={`flag ${metadata.flags.rgb ? 'active' : ''}`}>
            16-bit RGB
          </div>
          <div className={`flag ${metadata.flags.indexed ? 'active' : ''}`}>
            8-bit Indexed
          </div>
          <div className={`flag ${metadata.flags.etrle_compressed ? 'active' : ''}`}>
            ETRLE Compressed
          </div>
          <div className={`flag ${metadata.flags.zlib_compressed ? 'active' : ''}`}>
            ZLIB Compressed
          </div>
          <div className={`flag ${metadata.flags.transparent ? 'active' : ''}`}>
            Transparency
          </div>
          <div className={`flag ${metadata.flags.alpha ? 'active' : ''}`}>
            Alpha Channel
          </div>
        </div>
      </div>

      <div className="metadata-section">
        <h4>Technical Details</h4>
        <div className="metadata-row">
          <span className="label">Original Size:</span>
          <span className="value">{formatBytes(metadata.original_size)}</span>
        </div>
        <div className="metadata-row">
          <span className="label">Compressed Size:</span>
          <span className="value">{formatBytes(metadata.compressed_size)}</span>
        </div>
        {metadata.flags.indexed && (
          <>
            <div className="metadata-row">
              <span className="label">Palette Colors:</span>
              <span className="value">{metadata.palette_colors}</span>
            </div>
            <div className="metadata-row">
              <span className="label">Transparent Color:</span>
              <span className="value">{metadata.transparent_color}</span>
            </div>
          </>
        )}
        {metadata.flags.rgb && (
          <>
            <div className="metadata-row">
              <span className="label">Red Depth:</span>
              <span className="value">{metadata.red_depth} bit</span>
            </div>
            <div className="metadata-row">
              <span className="label">Green Depth:</span>
              <span className="value">{metadata.green_depth} bit</span>
            </div>
            <div className="metadata-row">
              <span className="label">Blue Depth:</span>
              <span className="value">{metadata.blue_depth} bit</span>
            </div>
          </>
        )}
        {metadata.app_data_size > 0 && (
          <div className="metadata-row">
            <span className="label">Animation Data:</span>
            <span className="value">{formatBytes(metadata.app_data_size)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetadataPanel;