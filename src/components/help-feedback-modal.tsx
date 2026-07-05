"use client";

import { useState } from "react";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { toast } from "sonner";
import { sendFeedback } from "@/server/actions/feedback";
import { XIcon } from "@/components/icons";

type Props = { onClose: () => void };

export function HelpFeedbackModal({ onClose }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEscapeKey(() => !sending && onClose());

  async function submit() {
    setSending(true);
    const res = await sendFeedback(message);
    setSending(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Message sent. We'll get back to you soon.");
    onClose();
  }

  return (
    <>
      <div className="modal-backdrop" onClick={() => !sending && onClose()} />
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <span className="modal-title">Help &amp; feedback</span>
          <button
            className="modal-close"
            onClick={() => !sending && onClose()}
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>

        <p className="text-[13px] text-(--ink-faint) leading-relaxed mt-0 mb-4">
          Ask a question or share feedback — we read every message.
        </p>

        <div className="field">
          <label className="label">Your message</label>
          <textarea
            className="inwrap w-full resize-none"
            style={{ height: 140 }}
            placeholder="Describe your question or feedback…"
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
            autoFocus
          />
          {message.length > 1600 && (
            <span className="block text-right text-[11px] text-(--ink-fainter) mt-1">
              {message.length}/2000
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            className="btn btn-ghost flex-1 justify-center"
            onClick={() => !sending && onClose()}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary flex-1 justify-center"
            onClick={submit}
            disabled={sending || !message.trim()}
          >
            {sending ? (
              <>
                <span className="mini-spin" /> Sending…
              </>
            ) : (
              "Send message"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
