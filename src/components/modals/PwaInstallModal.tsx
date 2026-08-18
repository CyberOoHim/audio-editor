import React from 'react';
import { Smartphone, Download, Share2, PlusSquare, Monitor, CheckCircle } from 'lucide-react';
import { Modal } from '../common/Modal';

export interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any; // BeforeInstallPromptEvent
  onPromptInstall: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onPromptInstall
}) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Install AudioCraft Studio PWA"
      maxWidth="480px"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 'var(--font-base)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
          <Smartphone size={28} color="var(--accent-cyan)" />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>100% Offline & Native-Speed</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-md)' }}>
              Install AudioCraft to your home screen for full-screen touch editing without browser bars.
            </div>
          </div>
        </div>

        {deferredPrompt ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <button className="btn btn-primary btn-lg" onClick={onPromptInstall} style={{ width: '100%' }}>
              <Download size={18} /> Click to Install AudioCraft App
            </button>
          </div>
        ) : isIOS ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>How to install on iPad / iPhone (Safari):</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>1</span>
              <span>Tap the <strong style={{ color: 'var(--accent-blue)' }}><Share2 size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Share</strong> icon in Safari's toolbar.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>2</span>
              <span>Scroll down and tap <strong style={{ color: 'var(--accent-cyan)' }}><PlusSquare size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Add to Home Screen</strong>.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>3</span>
              <span>Tap <strong style={{ color: '#fff' }}>Add</strong> in the top-right corner. Enjoy the standalone studio!</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>How to install on Android & Desktop Chrome:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
              <Monitor size={18} color="var(--accent-cyan)" />
              <span>Click the <strong>Install</strong> icon in the address bar or select <strong>Install AudioCraft Studio</strong> from the browser menu.</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-emerald)', fontSize: 'var(--font-md)' }}>
          <CheckCircle size={14} /> Works with touch gestures, pinch-to-zoom, and offline storage.
        </div>
      </div>
    </Modal>
  );
};
