"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { CompiledDoc } from "@/components/doc-render";
import { toast } from "sonner";
import {
  createMasterDocument,
  createPDF,
  getMasterDocumentStatus,
} from "@/server/actions/master-documents";
import type { CompilationSettings } from "@/server/actions/master-documents";

type DocStatus = "compiling" | "ready" | "failed";
type PdfStatus = "pending" | "generating" | "ready" | "failed";

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
  sources: { id: string; name: string }[];
  sourceIds: string[];
  contributorIds: string[];
  deletedSourceNames: string[];
  pdfStatus: PdfStatus;
};

type Props = {
  classId: string;
  topicId: string;
  topicName: string;
  canCompile: boolean;
  masterDocs: MasterDoc[];
};

const DEFAULTS: CompilationSettings = {
  outputType: "both",
  depth: "standard",
  conflictResolution: "trust_pinned",
  factChecking: "flag",
  sourcesInline: false,
  fromScratch: false,
};

const LABEL = {
  outputType: { bullet: "Bullets", prose: "Prose", both: "Both" } as const,
  depth: {
    concise: "Concise",
    standard: "Standard",
    detailed: "Detailed",
  } as const,
  conflictResolution: {
    trust_pinned: "Trust Pinned",
    trust_majority: "Majority",
    flag_all: "Flag All",
  } as const,
  factChecking: { none: "None", flag: "Flag", replace: "Replace" } as const,
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

type CompileStep = "fetching" | "generating" | "saving";
const HB_STEPS: [CompileStep, string][] = [
  ["fetching", "Fetching sources"],
  ["generating", "Generating"],
  ["saving", "Saving"],
];

export function MasterDocView({
  classId,
  topicId,
  topicName,
  canCompile,
  masterDocs: initialDocs,
}: Props) {
  const [docs, setDocs] = useState<MasterDoc[]>(initialDocs);
  const [activeId, setActiveId] = useState<string | null>(
    initialDocs[0]?.id ?? null,
  );
  const [showConfig, setShowConfig] = useState(false);
  const [compileStep, setCompileStep] = useState<CompileStep | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;
  const isCompiling = activeDoc?.status === "compiling";
  const inProgress = compileStep !== null || isCompiling;

  const [draft, setDraft] = useState<CompilationSettings>(
    initialDocs[0]
      ? {
          outputType: initialDocs[0].outputType,
          depth: initialDocs[0].depth,
          conflictResolution: initialDocs[0].conflictResolution,
          factChecking: initialDocs[0].factChecking,
          sourcesInline: initialDocs[0].sourcesInline,
          fromScratch: false,
        }
      : DEFAULTS,
  );

  useEffect(() => {
    const compilingDoc = docs.find((d) => d.status === "compiling");
    if (!compilingDoc) return;

    const interval = setInterval(async () => {
      const res = await getMasterDocumentStatus(compilingDoc.id);
      if ("error" in res) return;
      if (res.status !== "compiling") {
        clearInterval(interval);
        setCompileStep("saving");
        setTimeout(() => {
          setDocs((prev) =>
            prev.map((d) =>
              d.id === compilingDoc.id
                ? {
                    ...d,
                    status: res.status as DocStatus,
                    content: res.content,
                    failureReason: res.failureReason,
                    sources: res.sources,
                    sourceIds: res.sourceIds,
                    deletedSourceNames: res.deletedSourceNames,
                    contributorIds: res.contributorIds,
                    pdfStatus: res.pdfStatus,
                  }
                : d,
            ),
          );
          setCompileStep(null);
        }, 750);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [docs]);

  useEffect(() => {
    if (!activeDoc || activeDoc.pdfStatus !== "generating") return;
    const id = activeDoc.id;

    const interval = setInterval(async () => {
      const res = await createPDF(classId, id, false);
      if ("error" in res) return;
      if (!res.generating) {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, pdfStatus: res.url ? "ready" : "failed" } : d,
          ),
        );
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeDoc, classId]);

  async function handlePdf(force: boolean) {
    if (!activeDoc) return;
    const tab = force ? null : window.open("", "_blank");
    setPdfLoading(true);
    const res = await createPDF(classId, activeDoc.id, force);
    setPdfLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      tab?.close();
      return;
    }
    if (res.generating) {
      tab?.close();
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, pdfStatus: "generating" } : d,
        ),
      );
    } else if (res.url) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, pdfStatus: "ready" } : d,
        ),
      );
      if (tab) tab.location.href = res.url;
      else window.open(res.url, "_blank");
    }
  }

  function selectDoc(id: string) {
    const d = docs.find((x) => x.id === id);
    setActiveId(id);
    if (d && d.status !== "compiling") {
      setDraft({
        outputType: d.outputType,
        depth: d.depth,
        conflictResolution: d.conflictResolution,
        factChecking: d.factChecking,
        sourcesInline: d.sourcesInline,
        fromScratch: false,
      });
    }
  }

  function setSetting<K extends keyof CompilationSettings>(
    key: K,
    value: CompilationSettings[K],
  ) {
    setDraft((s) => ({ ...s, [key]: value }));
  }

  async function compile() {
    setCompileStep("fetching");

    const res = await createMasterDocument(classId, topicId, draft);

    if ("error" in res) {
      toast.error(res.error);
      setCompileStep(null);
      return;
    }

    setCompileStep("generating");

    const docSettings: Omit<CompilationSettings, "fromScratch"> = {
      outputType: draft.outputType,
      depth: draft.depth,
      conflictResolution: draft.conflictResolution,
      factChecking: draft.factChecking,
      sourcesInline: draft.sourcesInline,
    };
    const newDoc: MasterDoc = {
      id: res.masterDocumentId,
      status: "compiling",
      content: null,
      failureReason: null,
      ...docSettings,
      createdAt: new Date().toISOString(),
      sources: [],
      sourceIds: [],
      contributorIds: [],
      deletedSourceNames: [],
      pdfStatus: "pending",
    };
    setDocs((prev) => [newDoc, ...prev].slice(0, 4));
    setActiveId(res.masterDocumentId);
  }

  const stepIndex = compileStep
    ? HB_STEPS.findIndex(([k]) => k === compileStep)
    : -1;
  const sources = activeDoc?.sourceIds.length ?? 0;
  const contributors = activeDoc?.contributorIds.length ?? 0;
  const hasDoc = docs.length > 0;

  return (
    <div className="pane ruled">
      <div className="pane-head">
        <div>
          <div className="kicker">Master Document</div>
          <h1 className="pane-title">{topicName}</h1>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flexShrink: 0,
            alignItems: "flex-end",
          }}
        >
          {canCompile && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost"
                style={{
                  fontSize: 13.5,
                  padding: "10px 16px",
                  borderRadius: 10,
                }}
                onClick={() => setShowConfig((s) => !s)}
                disabled={inProgress}
              >
                <SettingsIcon />
                Compile settings
              </button>
              <button
                className="btn btn-primary"
                style={{
                  fontSize: 13.5,
                  padding: "10px 16px",
                  borderRadius: 10,
                }}
                onClick={compile}
                disabled={inProgress}
              >
                {inProgress ? (
                  <>
                    <span className="mini-spin" />
                    {compileStep === "fetching"
                      ? "Fetching sources…"
                      : compileStep === "generating"
                        ? "Generating"
                        : compileStep === "saving"
                          ? "Saving…"
                          : "Compiling…"}
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
          {activeDoc && activeDoc.status === "ready" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost"
                style={{
                  fontSize: 13.5,
                  padding: "10px 16px",
                  borderRadius: 10,
                }}
                disabled={pdfLoading || activeDoc.pdfStatus === "generating"}
                onClick={() => handlePdf(false)}
              >
                {pdfLoading || activeDoc.pdfStatus === "generating" ? (
                  <>
                    <span className="mini-spin" />
                    Generating PDF…
                  </>
                ) : activeDoc.pdfStatus === "ready" ? (
                  <>
                    <DownloadIcon />
                    Download PDF
                  </>
                ) : activeDoc.pdfStatus === "failed" ? (
                  <>
                    <RecompileIcon />
                    Retry PDF
                  </>
                ) : (
                  <>
                    <PdfIcon />
                    Generate PDF
                  </>
                )}
              </button>
              {activeDoc.pdfStatus === "ready" && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: "10px 11px", borderRadius: 10 }}
                  title="Regenerate PDF"
                  disabled={pdfLoading}
                  onClick={() => handlePdf(true)}
                >
                  <RecompileIcon />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Version switcher */}
      {docs.length > 0 && (
        <div className="doc-switch">
          {docs.map((d) => (
            <button
              key={d.id}
              className={`doc-pill${d.id === activeId ? " on" : ""}`}
              onClick={() => selectDoc(d.id)}
            >
              <span className="dp-when">{timeAgo(d.createdAt)}</span>
              <span className="dp-meta">
                {LABEL.outputType[d.outputType]} · {d.sourceIds.length} sources
              </span>
            </button>
          ))}
          <span className="doc-keep">Saves last 3 only</span>
        </div>
      )}

      {/* Provenance chips */}
      {activeDoc && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 24,
          }}
        >
          <Link
            className="chip link"
            href={
              contributors > 0
                ? `/home/${classId}/${topicId}/collection?members=${activeDoc.contributorIds.join(",")}`
                : `/home/${classId}/${topicId}/collection`
            }
          >
            <MembersIcon />
            From{" "}
            <b>
              {contributors} contributor{contributors !== 1 ? "s" : ""}
            </b>
            <ChevronExtIcon />
          </Link>
          <Link
            className="chip link"
            href={
              sources > 0
                ? `/home/${classId}/${topicId}/collection?sources=${activeDoc.sourceIds.join(",")}`
                : `/home/${classId}/${topicId}/collection`
            }
          >
            <CollectionIcon />
            <b>
              {sources} source{sources !== 1 ? "s" : ""}
            </b>
            <ChevronExtIcon />
          </Link>
          {activeDoc.deletedSourceNames.length > 0 && (
            <span className="chip deleted-chip">
              <b>{activeDoc.deletedSourceNames.length} deleted</b>
              <span className="tip">
                {activeDoc.deletedSourceNames.map((n, i) => (
                  <span key={i} className="del-name">
                    {n}
                  </span>
                ))}
              </span>
            </span>
          )}
          {activeDoc.status !== "compiling" && (
            <span className="chip">
              <ClockIcon />
              Compiled <b>{timeAgo(activeDoc.createdAt)}</b>
            </span>
          )}
        </div>
      )}

      {/* Specbar — read-only settings of the selected doc */}
      {activeDoc && activeDoc.status !== "compiling" && (
        <div className="specbar">
          <span className="sb-lead">Compiled with</span>
          <span className="spec">
            <i>Format</i> {LABEL.outputType[activeDoc.outputType]}
          </span>
          <span className="spec">
            <i>Depth</i> {LABEL.depth[activeDoc.depth]}
          </span>
          <span className="spec">
            <i>Conflicts</i>{" "}
            {LABEL.conflictResolution[activeDoc.conflictResolution]}
          </span>
          <span className="spec">
            <i>Fact-check</i> {LABEL.factChecking[activeDoc.factChecking]}
          </span>
          <span className={`spec${activeDoc.sourcesInline ? "" : " off"}`}>
            <i>Inline sources</i> {activeDoc.sourcesInline ? "On" : "Off"}
          </span>
        </div>
      )}

      {/* Compile settings panel */}
      {showConfig && !inProgress && (
        <div className="cfg rounded-[15px] bg-(--paper-raised) border border-(--line) px-4.5 mb-6">
          <div className="set-row">
            <div className="sl">
              <div className="st">Format</div>
              <div className="set-desc">
                Bullet points, prose paragraphs, or a mix of both.
              </div>
            </div>
            <div className="fmt-seg">
              {(["bullet", "prose", "both"] as const).map((v) => (
                <button
                  key={v}
                  className={draft.outputType === v ? "on" : ""}
                  onClick={() => setSetting("outputType", v)}
                >
                  {LABEL.outputType[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div className="sl">
              <div className="st">Depth</div>
              <div className="set-desc">How much detail to include.</div>
            </div>
            <div className="fmt-seg">
              {(["concise", "standard", "detailed"] as const).map((v) => (
                <button
                  key={v}
                  className={draft.depth === v ? "on" : ""}
                  onClick={() => setSetting("depth", v)}
                >
                  {LABEL.depth[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div className="sl">
              <div className="st">Conflicts</div>
              <div className="set-desc">
                How to handle disagreements between sources.
              </div>
            </div>
            <div className="fmt-seg">
              {(["trust_pinned", "trust_majority", "flag_all"] as const).map(
                (v) => (
                  <button
                    key={v}
                    className={draft.conflictResolution === v ? "on" : ""}
                    onClick={() => setSetting("conflictResolution", v)}
                  >
                    {LABEL.conflictResolution[v]}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="set-row">
            <div className="sl">
              <div className="st">Fact-check</div>
              <div className="set-desc">
                How to handle potentially incorrect claims.
              </div>
            </div>
            <div className="fmt-seg">
              {(["none", "flag", "replace"] as const).map((v) => (
                <button
                  key={v}
                  className={draft.factChecking === v ? "on" : ""}
                  onClick={() => setSetting("factChecking", v)}
                >
                  {LABEL.factChecking[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div className="sl">
              <div className="st">Inline sources</div>
              <div className="set-desc">
                Add source citations next to claims.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.sourcesInline}
                onChange={() =>
                  setSetting("sourcesInline", !draft.sourcesInline)
                }
              />
              <span className="track" />
            </label>
          </div>
          <div className={`set-row${hasDoc ? " scratch" : ""}`}>
            <div className="sl">
              <div className="st">Recompile from scratch</div>
              <div className="set-desc">
                Include all sources, not just new ones since the last compile.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.fromScratch}
                onChange={() => setSetting("fromScratch", !draft.fromScratch)}
              />
              <span className="track" />
            </label>
          </div>
        </div>
      )}

      {/* Compile heartbeat */}
      {inProgress && (
        <div className="card hb">
          {HB_STEPS.map(([key, label], i) => {
            const state =
              stepIndex < 0
                ? ""
                : i < stepIndex
                  ? "done"
                  : i === stepIndex
                    ? "on"
                    : "";
            return (
              <Fragment key={key}>
                {i > 0 && <span className="hb-line" />}
                <span className={`hb-step${state ? ` ${state}` : ""}`}>
                  <span className="hb-ic">
                    {state === "done" ? (
                      <CheckIcon />
                    ) : state === "on" ? (
                      <span className="spin-amber" />
                    ) : (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 9,
                          background: "var(--ink-fainter)",
                        }}
                      />
                    )}
                  </span>
                  {label}
                  {state === "on" && key === "generating" ? "…" : ""}
                </span>
              </Fragment>
            );
          })}
        </div>
      )}

      {/* Content */}
      {!inProgress &&
        (activeDoc?.status === "failed" ? (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <FailIcon />
            <p className="text-[15px] text-(--ink-heading) font-semibold m-0">
              Compilation failed
            </p>
            {activeDoc.failureReason && (
              <p className="text-[13.5px] text-(--ink-faint) m-0 max-w-sm">
                {activeDoc.failureReason}
              </p>
            )}
          </div>
        ) : activeDoc?.content ? (
          <CompiledDoc
            markdown={activeDoc.content}
            classId={classId}
            topicId={topicId}
            allSources={activeDoc.sources}
          />
        ) : (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <DocEmptyIcon />
            <p className="text-[15px] text-(--ink-heading) font-semibold m-0">
              No document yet
            </p>
            <p className="text-[13.5px] text-(--ink-faint) m-0 max-w-xs">
              Add sources in the Collection tab, then click{" "}
              <strong>{hasDoc ? "Recompile" : "Compile"}</strong> to generate
              the master document.
            </p>
          </div>
        ))}
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

function ChevronExtIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ext"
    >
      <path d="M7 17L17 7M7 7h10v10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
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

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6" />
      <path d="M14 12v6" />
      <path d="M14 12h2" />
      <path d="M14 15h2" />
    </svg>
  );
}
