"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClass, joinClass } from "@/server/actions/classes";
import { toast } from "sonner";
import { InfoIcon as WarnIcon, BookIcon, HashIcon } from "@/components/icons";

type Mode = "create" | "join";

type Props = {
  onClose: () => void;
};

const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function ClassModal({ onClose }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [className, setClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function switchMode(m: Mode) {
    setMode(m);
    setClassName("");
    setJoinCode("");
    setError("");
  }

  async function handleCreate() {
    const clsName = className.trim();
    if (clsName.length < 3) {
      setError("Class name must be at least three characters long.");
      setClassName(clsName);
      return;
    }

    setLoading(true);
    const result = await createClass(clsName);
    setLoading(false);

    if (result.error) return setError(result.error);

    toast.success("Class created!");
    router.refresh();
    onClose();
  }

  async function handleJoin() {
    const code = joinCode.trim();

    if (!CODE_RE.test(code)) {
      setError("Enter a valid class code, e.g. A1B2-C3D4");
      return;
    }

    setLoading(true);
    const result = await joinClass(code);
    setLoading(false);

    if (result.error) return setError(result.error);

    toast.success("Joined class!");
    router.refresh();
    onClose();
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">
            {mode === "create" ? "Create a class" : "Join a class"}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mtabs">
          <button
            className={`mtab${mode === "create" ? " on" : ""}`}
            onClick={() => switchMode("create")}
          >
            Create
          </button>
          <button
            className={`mtab${mode === "join" ? " on" : ""}`}
            onClick={() => switchMode("join")}
          >
            Join
          </button>
        </div>

        {mode === "create" ? (
          <>
            <div className="field">
              <label className="label">Class name</label>
              <div className={`inwrap${className ? " filled" : ""}`}>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Introduction to Psychology"
                  autoFocus
                />
                <span className="lead">
                  <BookIcon />
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
              className="submit"
              type="button"
              style={{ marginTop: 0 }}
              disabled={loading || !className.trim()}
              onClick={handleCreate}
            >
              {loading ? (
                <>
                  <span className="spin" />
                  Creating...
                </>
              ) : (
                "Create class"
              )}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label className="label">Class code</label>
              <div className={`inwrap${joinCode ? " filled" : ""}`}>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2-C3D4"
                  autoFocus
                />
                <span className="lead">
                  <HashIcon />
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
              className="submit"
              type="button"
              style={{ marginTop: 0 }}
              disabled={loading || !joinCode.trim()}
              onClick={handleJoin}
            >
              {loading ? (
                <>
                  <span className="spin" />
                  Joining...
                </>
              ) : (
                "Join class"
              )}
            </button>
          </>
        )}
      </div>
    </>
  );
}
