'use client';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

/** Win95 window chrome around a Radix dialog (focus trap, Esc, aria). */
export function Win95Dialog({ open, onOpenChange, title, children, width = 520, describedBy }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; width?: number; describedBy?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          aria-describedby={describedBy}
          className="w95-window fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden outline-none"
          style={{ maxWidth: width }}
        >
          <div className="w95-title">
            <Dialog.Title className="truncate text-[13px]">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="w95-btn ml-3 flex h-[18px] min-w-0 w-[20px] items-center justify-center p-0 text-[12px] font-bold leading-none">×</button>
            </Dialog.Close>
          </div>
          <div className="max-h-[calc(90vh-40px)] overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Win95Button({ children, onClick, disabled, isDefault, type = 'button', ariaLabel }: { children: ReactNode; onClick?: () => void; disabled?: boolean; isDefault?: boolean; type?: 'button' | 'submit'; ariaLabel?: string }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={`w95-btn ${isDefault ? 'w95-btn-default font-semibold' : ''}`}>
      {children}
    </button>
  );
}

/** The three classic dialog icons, drawn rather than emoji. */
export function StopIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18" fill="#c00000" stroke="#600000" />
      <rect x="9" y="17" width="22" height="6" fill="#fff" />
    </svg>
  );
}
export function WarnIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      <polygon points="20,3 38,36 2,36" fill="#f5d800" stroke="#7a6a00" />
      <rect x="18" y="13" width="4" height="13" fill="#000" />
      <rect x="18" y="29" width="4" height="4" fill="#000" />
    </svg>
  );
}
export function OkIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18" fill="#008000" stroke="#004000" />
      <polyline points="11,21 17,27 29,13" fill="none" stroke="#fff" strokeWidth="4" />
    </svg>
  );
}
export function InfoIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18" fill="#fff" stroke="#000080" strokeWidth="2" />
      <rect x="18" y="17" width="4" height="13" fill="#000080" />
      <rect x="18" y="10" width="4" height="4" fill="#000080" />
    </svg>
  );
}
