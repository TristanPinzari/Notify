"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  danger?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmIcon,
  danger = false,
  pending,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="text-sm text-(--ink-faint) mb-4 mt-0 leading-normal">
          {description}
        </p>
        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-(--paper-raised) border border-(--line) text-(--ink-nav) rounded-[9px] text-sm font-semibold py-2.5 hover:border-(--line-strong) transition-all cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[9px] text-sm font-semibold py-2.5 cursor-pointer transition-all disabled:opacity-50"
            style={
              danger
                ? {
                    background: "var(--danger-bg)",
                    border: "1px solid var(--danger-soft)",
                    color: "var(--danger)",
                  }
                : {
                    background: "var(--accent)",
                    border: "1px solid transparent",
                    color: "var(--on-accent)",
                  }
            }
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <span className="spin" style={{ width: 14, height: 14 }} />
            ) : (
              confirmIcon
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
