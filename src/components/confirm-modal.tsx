"use client";

import type { ReactNode } from "react";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { XIcon } from "@/components/icons";

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
  useEscapeKey(onClose);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={16} />
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
              <span className="spin w-3.5 h-3.5" />
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
