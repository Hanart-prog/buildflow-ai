import { useEffect, useRef, type ReactNode } from 'react';

type Props = { label: string; className?: string; onClose: () => void; children: ReactNode };

export function Modal({ label, className = '', onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector('input')?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-label={label}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-body">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    </dialog>
  );
}
