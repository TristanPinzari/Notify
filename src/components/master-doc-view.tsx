"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  createMasterDocument,
  getMasterDocumentStatus,
} from "@/server/actions/master-documents";
import type { CompilationSettings } from "@/server/actions/master-documents";

type DocStatus = "compiling" | "ready" | "failed";

type MasterDoc = {
  id: string;
  status: DocStatus;
  content: string | null;
  failureReason: string | null;
  outputType: CompilationSettings["outputType"];
  depth: CompilationSettings["depth"];
  conflictResolution: CompilationSettings["conflictResolution"];
  factChecking: CompilationSettings["factChecking"];
  sourcesInline: boolean;
  createdAt: string;
};

type Props = {
  classId: string;
  topicId: string;
  topicName: string;
  canCompile: boolean;
  masterDoc: MasterDoc | null;
  contributors: number;
  sources: number;
};

const DEFAULTS: CompilationSettings = {
  outputType: "both",
  depth: "standard",
  conflictResolution: "trust_pinned",
  factChecking: "flag",
  sourcesInline: false,
  fromScratch: false,
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MasterDocView({
  classId,
  topicId,
  topicName,
  canCompile,
  masterDoc,
  contributors,
  sources,
}: Props) {
  const [showConfig, setShowConfig] = useState(false);
  const [compiling, setCompiling] = useState(false);

  const [settings, setSettings] = useState<CompilationSettings>(
    masterDoc
      ? {
          outputType: masterDoc.outputType,
          depth: masterDoc.depth,
          conflictResolution: masterDoc.conflictResolution,
          factChecking: masterDoc.factChecking,
          sourcesInline: masterDoc.sourcesInline,
          fromScratch: false,
        }
      : DEFAULTS,
  );

  const [docId, setDocId] = useState<string | null>(masterDoc?.id ?? null);
  const [status, setStatus] = useState<DocStatus | null>(
    masterDoc?.status ?? null,
  );
  const [content, setContent] = useState<string | null>(
    masterDoc?.content ?? null,
  );
  const [failureReason, setFailureReason] = useState<string | null>(
    masterDoc?.failureReason ?? null,
  );
  const [compiledAt, setCompiledAt] = useState<string | null>(
    masterDoc?.createdAt ?? null,
  );

  useEffect(() => {
    if (status !== "compiling" || !docId) return;
    const interval = setInterval(async () => {
      const res = await getMasterDocumentStatus(docId);
      if ("error" in res) return;
      if (res.status !== "compiling") {
        setStatus(res.status);
        setContent(res.content);
        setFailureReason(res.failureReason);
        if (res.status === "ready") setCompiledAt(new Date().toISOString());
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, docId]);

  async function compile() {
    setCompiling(true);
    const res = await createMasterDocument(classId, topicId, settings);
    if ("error" in res) {
      toast.error(res.error);
      setCompiling(false);
      return;
    }
    setDocId(res.masterDocumentId);
    setStatus("compiling");
    setContent(null);
    setFailureReason(null);
    setCompiling(false);
  }

  function setSetting<K extends keyof CompilationSettings>(
    key: K,
    value: CompilationSettings[K],
  ) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  const hasDoc = masterDoc !== null;
  const isCompiling = status === "compiling";

  return (
    <div className="pane ruled">
      <div className="pane-head">
        <div>
          <div className="kicker">Master Document</div>
          <h1 className="pane-title">{topicName}</h1>
        </div>
        {canCompile && (
          <div className="flex gap-2 shrink-0 mt-2">
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13.5, padding: "10px 16px", borderRadius: 10 }}
              onClick={() => setShowConfig((s) => !s)}
            >
              <SettingsIcon />
              Compile settings
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13.5, padding: "10px 16px", borderRadius: 10 }}
              onClick={compile}
              disabled={compiling || isCompiling}
            >
              {isCompiling || compiling ? (
                <>
                  <span className="mini-spin" />
                  Compiling…
                </>
              ) : (
                <>
                  <RecompileIcon />
                  {hasDoc ? "Recompile" : "Compile"}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap gap-2"
        style={{ marginBottom: showConfig ? 18 : 24 }}
      >
        <span className="chip">
          <MembersIcon />
          From{" "}
          <b>
            {contributors} contributor{contributors !== 1 ? "s" : ""}
          </b>
        </span>
        <span className="chip">
          <CollectionIcon />
          <b>
            {sources} source{sources !== 1 ? "s" : ""}
          </b>
        </span>
        {compiledAt && !isCompiling && (
          <span className="chip">
            <ClockIcon />
            Compiled <b>{timeAgo(compiledAt)}</b>
          </span>
        )}
      </div>

      {showConfig && (
        <div className="rounded-[15px] bg-(--paper-raised) border border-(--line) px-4.5 mb-6">
          <div className="set-row">
            <div className="set-row-label">
              <div className="set-row-title">Format</div>
              <div className="set-row-desc">
                Bullet points, prose paragraphs, or a mix of both.
              </div>
            </div>
            <div className="fmt-seg">
              {(["bullet", "prose", "both"] as const).map((v) => (
                <button
                  key={v}
                  className={settings.outputType === v ? "on" : ""}
                  onClick={() => setSetting("outputType", v)}
                >
                  {v === "bullet"
                    ? "Bullets"
                    : v === "prose"
                      ? "Prose"
                      : "Both"}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-label">
              <div className="set-row-title">Depth</div>
              <div className="set-row-desc">How much detail to include.</div>
            </div>
            <div className="fmt-seg">
              {(["concise", "standard", "detailed"] as const).map((v) => (
                <button
                  key={v}
                  className={settings.depth === v ? "on" : ""}
                  onClick={() => setSetting("depth", v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-label">
              <div className="set-row-title">Conflicts</div>
              <div className="set-row-desc">
                How to handle disagreements between sources.
              </div>
            </div>
            <div className="fmt-seg">
              {(["trust_pinned", "trust_majority", "flag_all"] as const).map(
                (v) => (
                  <button
                    key={v}
                    className={settings.conflictResolution === v ? "on" : ""}
                    onClick={() => setSetting("conflictResolution", v)}
                  >
                    {v === "trust_pinned"
                      ? "Trust Pinned"
                      : v === "trust_majority"
                        ? "Majority"
                        : "Flag All"}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-label">
              <div className="set-row-title">Fact-check</div>
              <div className="set-row-desc">
                How to handle potentially incorrect claims.
              </div>
            </div>
            <div className="fmt-seg">
              {(["none", "flag", "replace"] as const).map((v) => (
                <button
                  key={v}
                  className={settings.factChecking === v ? "on" : ""}
                  onClick={() => setSetting("factChecking", v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-label">
              <div className="set-row-title">Inline sources</div>
              <div className="set-row-desc">
                Add source citations next to claims.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.sourcesInline}
                onChange={() =>
                  setSetting("sourcesInline", !settings.sourcesInline)
                }
              />
              <span className="track" />
            </label>
          </div>

          {hasDoc && (
            <div className="set-row">
              <div className="set-row-label">
                <div className="set-row-title">Recompile from scratch</div>
                <div className="set-row-desc">
                  Include all sources, not just new ones since the last compile.
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.fromScratch}
                  onChange={() =>
                    setSetting("fromScratch", !settings.fromScratch)
                  }
                />
                <span className="track" />
              </label>
            </div>
          )}
        </div>
      )}

      {isCompiling ? (
        <div className="flex flex-col items-center text-center py-16 gap-3">
          <span className="mini-spin" style={{ width: 28, height: 28 }} />
          <p className="text-[15px] text-(--ink-heading) font-semibold m-0">
            Compiling…
          </p>
          <p className="text-[13.5px] text-(--ink-faint) m-0 max-w-xs">
            This may take a minute. The page will update automatically.
          </p>
        </div>
      ) : status === "failed" ? (
        <div className="flex flex-col items-center text-center py-16 gap-3">
          <FailIcon />
          <p className="text-[15px] text-(--ink-heading) font-semibold m-0">
            Compilation failed
          </p>
          {failureReason && (
            <p className="text-[13.5px] text-(--ink-faint) m-0 max-w-sm">
              {failureReason}
            </p>
          )}
        </div>
      ) : content ? (
        <article className="doc">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>
      ) : (
        <div className="flex flex-col items-center text-center py-16 gap-3">
          <DocEmptyIcon />
          <p className="text-[15px] text-(--ink-heading) font-semibold m-0">
            No document yet
          </p>
          <p className="text-[13.5px] text-(--ink-faint) m-0 max-w-xs">
            Add sources in the Collection tab, then click{" "}
            <strong>{hasDoc ? "Recompile" : "Compile"}</strong> to generate the
            master document.
          </p>
        </div>
      )}
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function RecompileIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function DocEmptyIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--line-strong)" }}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--line-strong)" }}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}
