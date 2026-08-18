import React, { useState } from 'react';
import { Folder, FolderPlus, Trash2, Edit2, Check, X, Layers } from 'lucide-react';
import type { FolderItem } from '../../types/storage';

export interface FolderTreeProps {
  folders: FolderItem[];
  activeFolderId: string | null; // null means all / root
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string, color?: string) => Promise<void>;
  onRenameFolder: (id: string, newName: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
}

const FOLDER_COLORS = ['#38bdf8', '#00f0ff', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = async () => {
    if (newFolderName.trim()) {
      await onCreateFolder(newFolderName.trim(), selectedColor);
      setNewFolderName('');
      setIsCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (editingName.trim()) {
      await onRenameFolder(id, editingName.trim());
      setEditingId(null);
    }
  };

  return (
    <div className="folder-list-container">
      <div className="folder-section-title">
        <span>Folders & Collections</span>
        <button
          className="btn btn-ghost btn-icon-sm"
          onClick={() => setIsCreating(!isCreating)}
          title="Create New Folder"
        >
          <FolderPlus size={15} />
        </button>
      </div>

      {/* New Folder Inline Form */}
      {isCreating && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Folder name..."
            value={newFolderName}
            autoFocus
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            style={{ width: '100%', marginBottom: 6 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {FOLDER_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    outline: selectedColor === c ? '2px solid white' : 'none'
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                <Check size={12} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreating(false)}>
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="folder-list">
        {/* All Files Tab */}
        <div
          className={`folder-item ${activeFolderId === null ? 'active' : ''}`}
          onClick={() => onSelectFolder(null)}
        >
          <div className="folder-left">
            <Layers size={16} />
            <span className="folder-name">All Audio Files</span>
          </div>
        </div>

        {/* Dynamic Folders */}
        {folders.map((folder) => {
          const isEditing = editingId === folder.id;
          const isActive = activeFolderId === folder.id;

          return (
            <div
              key={folder.id}
              className={`folder-item ${isActive ? 'active' : ''}`}
              onClick={() => !isEditing && onSelectFolder(folder.id)}
            >
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={editingName}
                    autoFocus
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(folder.id)}
                    style={{ flex: 1, padding: '2px 6px', fontSize: 12 }}
                  />
                  <button className="btn btn-primary btn-icon-sm" onClick={() => handleRename(folder.id)}>
                    <Check size={12} />
                  </button>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => setEditingId(null)}>
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="folder-left">
                    <span
                      className="folder-dot"
                      style={{ backgroundColor: folder.color || 'var(--accent-blue)' }}
                    />
                    <Folder size={15} />
                    <span className="folder-name">{folder.name}</span>
                  </div>

                  <div className="folder-actions" style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-icon-sm"
                      onClick={() => {
                        setEditingId(folder.id);
                        setEditingName(folder.name);
                      }}
                      title="Rename"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon-sm"
                      onClick={() => onDeleteFolder(folder.id)}
                      title="Delete Folder"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
