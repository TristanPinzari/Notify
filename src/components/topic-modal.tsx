"use client";

import { useState } from "react";
import { createTopic } from "@/server/actions/topics";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { toast } from "sonner";
import { InfoIcon as WarnIcon, TopicIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { mutate } from "swr";

type Props = {
  classId: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export function TopicModal({ classId, onClose, onSuccess }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEscapeKey(onClose);

  async function handleCreate() {
    const topicName = name.trim();
    if (topicName.length < 1) {
      setError("Topic name cannot be empty.");
      return;
    }

    setLoading(true);
    const result = await createTopic(classId, topicName);
    setLoading(false);

    if ("error" in result) return setError(result.error);

    toast.success("Topic created!");
    if ("id" in result) router.push(`/home/${classId}/${result.id}`);
    mutate("/api/sidebar");
    onSuccess?.();
    onClose();
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">New topic</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="field">
          <label className="label">Topic name</label>
          <div className={`inwrap${name ? " filled" : ""}`}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Week 3 — Cellular Respiration"
              autoFocus
            />
            <span className="lead">
              <TopicIcon />
            </span>
          </div>
        </div>

        {error && (
          <div className="formerr justify-center mb-3">
            <WarnIcon />
            {error}
          </div>
        )}

        <button
          className="submit mt-0"
          type="button"
          disabled={loading || !name.trim()}
          onClick={handleCreate}
        >
          {loading ? (
            <>
              <span className="spin" />
              Creating...
            </>
          ) : (
            "Create topic"
          )}
        </button>
      </div>
    </>
  );
}
