import React from 'react';
import { HardDrive, Archive, UploadCloud } from 'lucide-react';
import type { StorageUsage } from '../../types/storage';
import { SUPPORTED_FORMATS_SUMMARY } from '../../audio/audioFormats';

export interface StorageMeterProps {
  usage: StorageUsage | null;
  onExportZip: () => void;
  onImportClick: () => void;
}

export const StorageMeter: React.FC<StorageMeterProps> = ({
  usage,
  onExportZip,
  onImportClick
}) => {
  const percent = usage ? Math.min(100, Math.max(0, usage.percent)) : 0;
  const isHigh = percent > 80;

  return (
    <div className="storage-meter">
      <div className="storage-info">
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
          <HardDrive size={13} color="var(--accent-cyan)" />
          IndexedDB Storage
        </span>
        <span>
          {usage ? `${usage.formattedUsage} / ${usage.formattedQuota}` : 'Checking...'}
        </span>
      </div>

      <div className="storage-progress-bg">
        <div
          className="storage-progress-fill"
          style={{
            width: `${percent}%`,
            background: isHigh
              ? 'linear-gradient(90deg, #f59e0b, #f43f5e)'
              : 'linear-gradient(90deg, #38bdf8, #00f0ff)'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          className="btn btn-secondary btn-sm"
          style={{ flex: 1, fontSize: 'var(--font-sm)' }}
          onClick={onImportClick}
          title={`Import audio files (${SUPPORTED_FORMATS_SUMMARY}) or .zip backup`}
        >
          <UploadCloud size={13} /> Import
        </button>
        <button
          className="btn btn-secondary btn-sm"
          style={{ flex: 1, fontSize: 'var(--font-sm)' }}
          onClick={onExportZip}
          title="Export all folders and audio files as a .zip backup"
        >
          <Archive size={13} /> Backup .ZIP
        </button>
      </div>
    </div>
  );
};
