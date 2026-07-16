"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { CompiledDoc } from "@/components/doc-render";
import { toast } from "sonner";
import {
  createMasterDocument,
  createPDF,
  getMasterDocumentStatus,
  updateMasterDocumentContent,
} from "@/server/actions/master-documents";
import type { CompilationSettings } from "@/server/actions/master-documents";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  SettingsIcon,
  RecompileIcon,
  MembersIcon,
  CollectionIcon,
  ClockIcon,
  ChevronExtIcon,
  EditIcon,
  CheckIcon,
  DocEmptyIcon,
  FailIcon,
  DownloadIcon,
  PdfIcon,
} from "@/components/icons";
import { timeAgo } from "@/lib/utils";

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
  manuallyEdited: boolean;
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
  canEdit: boolean;
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

const CONFLICT_TIP: Record<CompilationSettings["conflictResolution"], string> =
  {
    trust_pinned:
      "Trust pinned contributions when sources disagree — only flag if pinned contributions conflict with each other",
    trust_majority:
      "Go with what most contributions agree on — only flag when there's no clear majority",
    flag_all: "Always show disagreements as a visible conflict block",
    replace_flag:
      "Write the best answer inline — a subtle marker shows where contributions differed",
  };

const FACTCHECK_TIP: Record<CompilationSettings["factChecking"], string> = {
  none: "",
  flag: "Keep the original claim — dubious ones are marked, hover to see the suggested correction",
  replace:
    "Replace wrong claims with the correction — hover to see what the source originally said",
};

const LABEL = {
  outputType: { bullet: "Bullets", prose: "Prose", both: "Both" } as const,
  depth: {
    concise: "Concise",
    standard: "Standard",
    detailed: "Detailed",
  } as const,
  conflictResolution: {
    trust_pinned: "Pinned",
    trust_majority: "Majority",
    flag_all: "Flag",
    replace_flag: "Replace & Flag",
  } as const,
  factChecking: { none: "None", flag: "Flag", replace: "Replace" } as const,
};

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
  canEdit,
  masterDocs: initialDocs,
}: Props) {
  const [docs, setDocs] = useState<MasterDoc[]>(initialDocs);
  const [activeId, setActiveId] = useState<string | null>(
    initialDocs[0]?.id ?? null,
  );
  const [showConfig, setShowConfig] = useState(false);
  const [compileStep, setCompileStep] = useState<CompileStep | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;
  const isCompiling = activeDoc?.status === "compiling";
  const compileDisabled =
    docs.some((d) => d.status === "compiling") || compileStep !== null;

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
                    manuallyEdited: res.manuallyEdited,
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
    if (editMode) cancelEdit();
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

  function enterEdit() {
    if (!activeDoc?.content) return;
    setEditContent(activeDoc.content);
    setShowConfig(false);
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditContent("");
  }

  async function saveEdit() {
    if (!activeDoc) return;
    setEditSaving(true);
    try {
      const res = await updateMasterDocumentContent(
        classId,
        activeDoc.id,
        editContent,
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? {
                ...d,
                content: editContent,
                pdfStatus: "pending",
                manuallyEdited: true,
              }
            : d,
        ),
      );
      setEditMode(false);
      setEditContent("");
    } finally {
      setEditSaving(false);
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
    setShowConfig(false);
    try {
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
        manuallyEdited: false,
      };
      setDocs((prev) => [newDoc, ...prev].slice(0, 4));
      setActiveId(res.masterDocumentId);
    } catch {
      toast.error("Something went wrong.");
      setCompileStep(null);
    }
  }

  const stepIndex = compileStep
    ? HB_STEPS.findIndex(([k]) => k === compileStep)
    : -1;
  const sources = activeDoc?.sourceIds.length ?? 0;
  const contributors = activeDoc?.contributorIds.length ?? 0;
  const hasDoc = docs.length > 0;

  return (
    <div className={`pane${editMode ? " max-w-300" : ""}`}>
      <div className="pane-head">
        <div>
          <div className="kicker">Master Document</div>
          <h1 className="pane-title">{topicName}</h1>
        </div>
        <div
          className="flex flex-col gap-2 shrink-0 items-end"
          id="master-doc-buttons"
        >
          {editMode ? (
            <div className="flex gap-2">
              <button
                className="btn btn-ghost text-[13.5px] px-4 py-2.5 rounded-[10px]"
                onClick={cancelEdit}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary text-[13.5px] px-4 py-2.5 rounded-[10px]"
                onClick={saveEdit}
                disabled={editSaving}
              >
                {editSaving ? (
                  <>
                    <span className="mini-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          ) : null}
          {canCompile && !editMode && (
            <div className="flex gap-2">
              <button
                className="btn btn-ghost text-[13.5px] px-4 py-2.5 rounded-[10px]"
                onClick={() => setShowConfig((s) => !s)}
                disabled={compileDisabled}
              >
                <SettingsIcon />
                Compile settings
              </button>
              <button
                className="btn btn-primary text-[13.5px] px-4 py-2.5 rounded-[10px]"
                onClick={compile}
                disabled={compileDisabled}
              >
                {compileDisabled ? (
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
          {activeDoc && activeDoc.status === "ready" && !editMode && (
            <div className="flex gap-2">
              {canEdit && activeDoc.content && (
                <div className="flex gap-2">
                  <button
                    className="btn btn-ghost text-[13.5px] px-4 py-2.5 rounded-[10px]"
                    onClick={enterEdit}
                    disabled={compileDisabled}
                  >
                    <EditIcon />
                    Edit
                  </button>
                </div>
              )}
              <button
                className="btn btn-ghost text-[13.5px] px-4 py-2.5 rounded-[10px]"
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
                  className="btn btn-ghost px-2.75 py-2.5 rounded-[10px]"
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
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            className="chip link"
            href={
              contributors > 0
                ? `/home/${classId}/${topicId}/members?members=${activeDoc.contributorIds.join(",")}&reason=who+contributed+to+this+master+doc`
                : `/home/${classId}/${topicId}/members`
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
                ? `/home/${classId}/${topicId}/collection?sources=${activeDoc.sourceIds.join(",")}&reason=used+in+this+master+doc`
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
          {activeDoc.manuallyEdited && (
            <span className="chip">
              <EditIcon />
              Edited
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
      {showConfig && !compileDisabled && (
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
              {(
                [
                  "trust_pinned",
                  "trust_majority",
                  "flag_all",
                  "replace_flag",
                ] as const
              ).map((v) => (
                <button
                  key={v}
                  className={draft.conflictResolution === v ? "on" : ""}
                  onClick={() => setSetting("conflictResolution", v)}
                  title={CONFLICT_TIP[v]}
                >
                  {LABEL.conflictResolution[v]}
                </button>
              ))}
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
                  title={FACTCHECK_TIP[v] || undefined}
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
      {isCompiling && (
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
                      <span className="w-1.5 h-1.5 rounded-full bg-(--ink-fainter)" />
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

      {/* Edit split view */}
      {editMode && (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 min-w-0 h-[45vh] md:h-[calc(100dvh-150px)] overflow-hidden rounded-[10px]">
            <CodeMirror
              value={editContent}
              onChange={setEditContent}
              extensions={[markdown()]}
              theme={oneDark}
              height="calc(100dvh - 150px)"
              className="text-[13px]"
              basicSetup={{ lineNumbers: false, foldGutter: false }}
            />
          </div>
          <div className="flex-1 min-w-0 h-[45vh] md:h-[calc(100dvh-150px)] overflow-y-auto overflow-x-hidden">
            <CompiledDoc
              markdown={editContent}
              classId={classId}
              topicId={topicId}
              allSources={activeDoc?.sources}
            />
          </div>
        </div>
      )}

      {/* Content */}
      {!editMode &&
        !isCompiling &&
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
          <div className="flex flex-col items-center text-center py-16 gap-3 mt-15">
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
