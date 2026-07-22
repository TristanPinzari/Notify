"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CompiledDoc } from "@/components/doc-render";
import { toast } from "sonner";
import {
  createMasterDocument,
  createPDF,
  deleteMasterDocument,
  getMasterDocumentStatus,
  updateMasterDocumentContent,
} from "@/server/actions/master-documents";
import type { CompilationSettings } from "@/server/actions/master-documents";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEscapeKey } from "@/hooks/use-escape-key";
import {
  SettingsIcon,
  RecompileIcon,
  MembersIcon,
  CollectionIcon,
  ClockIcon,
  ChevronExtIcon,
  EditIcon,
  DocEmptyIcon,
  FailIcon,
  DownloadIcon,
  PdfIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
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

const EDITOR_EXTENSIONS = [markdown()];
const EDITOR_BASIC_SETUP = { lineNumbers: false, foldGutter: false };

const MENU_ITEM_CLS =
  "w-full flex items-center gap-2 text-left text-[13px] text-(--ink-body) px-2.5 py-1.5 rounded-[7px] hover:bg-(--bg-hover) cursor-pointer transition-colors border-none bg-transparent disabled:opacity-50 disabled:cursor-not-allowed";

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
  const [showActions, setShowActions] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [compiling, setCompiling] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [staticMode, setStaticMode] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;
  const compilingDocId = docs.find((d) => d.status === "compiling")?.id ?? null;
  const isCompiling = activeDoc?.status === "compiling";
  const docFailed = activeDoc?.status === "failed";
  useEscapeKey(() => {
    if (editMode && !editSaving) cancelEdit();
  });
  const compileDisabled = compilingDocId !== null || compiling;

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
    if (!compilingDocId) return;

    let fetching = false;
    const interval = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      const res = await getMasterDocumentStatus(compilingDocId);
      fetching = false;
      if ("error" in res) return;
      if (res.status !== "compiling") {
        clearInterval(interval);
        setDocs((prev) =>
          prev.map((d) =>
            d.id === compilingDocId
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
        setCompiling(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [compilingDocId]);

  const pdfPollingId =
    activeDoc?.pdfStatus === "generating" ? activeDoc.id : null;

  useEffect(() => {
    if (!pdfPollingId) return;

    let fetching = false;
    const interval = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      const res = await getMasterDocumentStatus(pdfPollingId);
      fetching = false;
      if ("error" in res) return;
      if (res.pdfStatus !== "generating") {
        clearInterval(interval);
        setDocs((prev) =>
          prev.map((d) =>
            d.id === pdfPollingId
              ? { ...d, pdfStatus: res.pdfStatus ?? "failed" }
              : d,
          ),
        );
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pdfPollingId]);

  useEffect(() => {
    if (!showActions) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (menuBtnRef.current?.contains(e.target as Node)) return;
      setShowActions(false);
    }
    function onClose() {
      setShowActions(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [showActions]);

  async function handlePdf(force: boolean) {
    if (!activeDoc) return;
    setPdfLoading(true);
    const res = await createPDF(classId, activeDoc.id, force);
    setPdfLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    if (res.generating) {
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
      window.open(res.url, "_blank");
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

  function openMenu() {
    if (showActions) return setShowActions(false);
    const r = menuBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setShowActions(true);
  }

  function enterEdit() {
    if (!activeDoc?.content) return;
    setEditContent(activeDoc.content);
    setShowConfig(false);
    setShowActions(false);
    setEditMode(true);
  }

  async function deleteDoc() {
    if (!activeDoc) return;
    const res = await deleteMasterDocument(classId, activeDoc.id);
    if ("error" in res) {
      toast.error(res.error);
      setShowActions(false);
      return;
    }
    const remaining = docs.filter((d) => d.id !== activeDoc.id);
    setDocs(remaining);
    setActiveId(remaining[0]?.id ?? null);
    setShowActions(false);
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
      toast.success("Changes saved.");
      setEditMode(false);
      setEditContent("");
    } catch {
      toast.error("Failed to save changes.");
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
    setCompiling(true);
    setShowConfig(false);
    try {
      const res = await createMasterDocument(classId, topicId, draft);

      if ("error" in res) {
        toast.error(res.error);
        setCompiling(false);
        return;
      }

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
      setDocs((prev) => [newDoc, ...prev].slice(0, 5));
      setActiveId(res.masterDocumentId);
    } catch {
      toast.error("Something went wrong.");
      setCompiling(false);
    }
  }

  const sources = activeDoc?.sourceIds.length ?? 0;
  const contributors = activeDoc?.contributorIds.length ?? 0;
  const hasDoc = docs.length > 0;

  return (
    <div className="pane">
      <div className="pane-head flex-col gap-3.5">
        <div>
          <div className="kicker">Master Document</div>
          <h1 className="pane-title">{topicName}</h1>
        </div>
        <div
          className="flex flex-col sm:flex-row gap-2 w-full"
          id="master-doc-buttons"
        >
          {canCompile && (
            <>
              <button
                className="btn btn-ghost text-[13.5px] px-4 py-2.5 rounded-[10px] w-full sm:flex-1 justify-center"
                onClick={() => setShowConfig((s) => !s)}
                disabled={compileDisabled}
              >
                <SettingsIcon />
                Compile settings
              </button>
              <button
                className="btn btn-primary text-[13.5px] px-4 py-2.5 rounded-[10px] w-full sm:flex-1 justify-center"
                onClick={compile}
                disabled={compileDisabled}
              >
                {compileDisabled ? (
                  <>
                    <span className="mini-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <RecompileIcon />
                    {hasDoc ? "Recompile" : "Compile"}
                  </>
                )}
              </button>
            </>
          )}
          {activeDoc && activeDoc.status !== "compiling" && (
            <button
              ref={menuBtnRef}
              className="btn btn-ghost text-[13.5px] px-4 py-2.5 rounded-[10px] w-full sm:flex-1 justify-center"
              onClick={openMenu}
            >
              <SettingsIcon />
              Actions
            </button>
          )}
        </div>
      </div>

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

      {/* Actions dropdown (portal) */}
      {showActions &&
        menuPos &&
        activeDoc &&
        activeDoc.status !== "compiling" &&
        !editMode &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed w-56 bg-(--paper-raised) border border-(--line-soft) rounded-[11px] shadow-[0_14px_34px_-12px_rgba(40,30,15,0.4)] p-1.5 z-200"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {canEdit && activeDoc.content && (
              <>
                <button
                  className={MENU_ITEM_CLS}
                  onClick={enterEdit}
                  disabled={docFailed}
                >
                  <EditIcon /> Edit
                </button>
                <div className="h-px bg-(--line) my-1 mx-1" />
              </>
            )}
            <button
              className={MENU_ITEM_CLS}
              disabled={
                docFailed || pdfLoading || activeDoc.pdfStatus === "generating"
              }
              onClick={() => {
                void handlePdf(false);
                if (activeDoc.pdfStatus === "ready") setShowActions(false);
              }}
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
                className={MENU_ITEM_CLS}
                disabled={pdfLoading}
                onClick={() => {
                  void handlePdf(true);
                }}
              >
                <RecompileIcon />
                Regenerate PDF
              </button>
            )}
            <div className="h-px bg-(--line) my-1 mx-1" />
            <button
              className={MENU_ITEM_CLS}
              disabled={docFailed}
              onClick={() => setStaticMode((s) => !s)}
            >
              {staticMode ? <EyeOffIcon /> : <EyeIcon />}
              {staticMode ? "Disable static view" : "Enable static view"}
            </button>
            {canEdit && (
              <>
                <div className="h-px bg-(--line) my-1 mx-1" />
                <button
                  className="w-full flex items-center gap-2 text-left text-[13px] px-2.5 py-1.5 rounded-[7px] hover:bg-(--bg-hover) cursor-pointer transition-colors border-none bg-transparent text-red-500"
                  onClick={deleteDoc}
                >
                  <TrashIcon />
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

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
          <span className="doc-keep">Saves last 5 only</span>
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

      {/* Compile heartbeat */}
      {isCompiling && (
        <div className="hb">
          <span className="hb-ring" />
          <div>
            <h3 className="hb-label">Compiling your master document…</h3>
            <p className="hb-sub">
              Pulling in new contributions and writing the updated version. This
              usually takes under a minute.
            </p>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editMode &&
        createPortal(
          <div className="edit-modal">
            <div className="edit-modal-head">
              <span className="edit-modal-title">{topicName}</span>
              <div className="flex items-center gap-2 shrink-0">
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
            </div>
            <div className="edit-modal-body">
              <div className="edit-modal-panel overflow-hidden rounded-[10px]">
                <CodeMirror
                  value={editContent}
                  onChange={setEditContent}
                  extensions={EDITOR_EXTENSIONS}
                  theme={oneDark}
                  height="100%"
                  className="h-full text-[13px]"
                  basicSetup={EDITOR_BASIC_SETUP}
                />
              </div>
              <div className="edit-modal-panel overflow-y-auto overflow-x-hidden">
                <CompiledDoc
                  markdown={editContent}
                  classId={classId}
                  topicId={topicId}
                  staticMode={staticMode}
                  allSources={activeDoc?.sources}
                />
              </div>
            </div>
          </div>,
          document.body,
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
            staticMode={staticMode}
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
