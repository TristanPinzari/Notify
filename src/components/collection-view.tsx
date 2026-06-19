"use client";

import { useState, useRef, useEffect } from "react";
import type { CType, EMethod, PStatus } from "@/server/db/schema";
import {
  createContribution,
  createCustomContribution,
  deleteContribution,
  editContribution,
  getContributionStatuses,
  getContributionText,
  getContributionUrl,
  restartExtraction,
} from "@/server/actions/contributions";
import { toast } from "sonner";
import { getPlaylistInfo, getVideoInfo } from "@/server/actions/youtube";
import {
  UploadIcon,
  LinkIcon,
  PlusIcon,
  ChevIcon,
  TrashIcon,
  CheckIcon,
  WarnIcon,
  InfoIcon,
  CollectionIcon,
  InspectIcon,
  EditPencilIcon,
  RetryIcon,
  XIcon,
  CopyIcon,
} from "@/components/icons";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const POLL_INTERVAL_MS = 5000;

export type ContributionRow = {
  contributionId: string;
  contributionName: string;
  contributionType: CType;
  extractionMethod: EMethod;
  isCompiled: boolean;
  status: PStatus;
  failureReason: string | null;
  manuallyEdited: boolean;
  uploaderName: string;
  uploaderId: string;
  createdAt: string;
};

const TYPE_LABEL: Record<CType, string> = {
  pdf: "PDF",
  image: "IMG",
  audio: "AUD",
  youtube: "YT",
  link: "LINK",
  text: "TXT",
  custom: "CUST",
};

const EXTRACTION_LABELS: Record<EMethod, string> = {
  text_extraction: "Text extraction",
  handwriting_ocr: "Handwriting OCR",
  speech_to_text: "Speech-to-text",
  youtube_transcript: "YouTube transcript",
  web_scrape: "Web scrape",
};

const METHODS_FOR_TYPE: Record<CType, EMethod[]> = {
  pdf: ["text_extraction", "handwriting_ocr"],
  image: ["handwriting_ocr", "text_extraction"],
  audio: ["speech_to_text"],
  youtube: ["youtube_transcript"],
  link: ["web_scrape"],
  text: ["text_extraction"],
  custom: ["text_extraction"],
};

type FileRow = {
  id: string;
  type: CType;
  name: string;
  who: string;
  uploaderId: string;
  createdAt: string;
  method: EMethod;
  status: PStatus;
  failureReason: string | null;
  manuallyEdited: boolean;
  isCompiled: boolean;
};

type StagedFile = {
  id: number;
  kind: "file";
  type: CType;
  name: string;
  size: string;
  method: EMethod;
  file?: File;
  text?: string;
};
type StagedLink = {
  id: number;
  kind: "link";
  type: "youtube" | "link";
  name: string;
  dur?: string;
  url: string;
  method: EMethod;
};
type PlVideo = {
  id: number;
  title: string;
  dur: string;
  url: string;
  checked: boolean;
};
type StagedPlaylist = {
  id: number;
  kind: "playlist";
  name: string;
  url: string;
  videos: PlVideo[];
  collapsed: boolean;
};
type StagedItem = StagedFile | StagedLink | StagedPlaylist;

let stageSeq = 1000;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusPill({
  status,
  failureReason,
}: {
  status: PStatus;
  failureReason?: string | null;
}) {
  if (status === "processing")
    return (
      <span className="status proc">
        <span className="spin-amber" />
        Processing
      </span>
    );
  if (status === "failed")
    return (
      <span
        className="status fail"
        title={failureReason ?? "Failure reason unknown."}
      >
        <WarnIcon />
        Failed
      </span>
    );
  return (
    <span className="status done">
      <CheckIcon />
      Ready
    </span>
  );
}

/* ---- SourceRow: committed source with expandable inspection panel ---- */
type SourceRowProps = {
  f: FileRow;
  currentUserId: string;
  classId: string;
  topicId: string;
  canDelete: boolean;
  onOpen: (id: string) => void;
  onRemove: (name: string, id: string) => void;
  onUpdate: (id: string, patch: Partial<FileRow>) => void;
};

function SourceRow({
  f,
  currentUserId,
  classId,
  topicId,
  canDelete,
  onOpen,
  onRemove,
  onUpdate,
}: SourceRowProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // undefined = not yet fetched; null = fetched, no text
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [loadingText, setLoadingText] = useState(false);
  const [dName, setDName] = useState("");
  const [dMethod, setDMethod] = useState<EMethod>(f.method);
  const [dText, setDText] = useState("");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyText() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const methods = METHODS_FOR_TYPE[f.type];
  const inspectable = f.status === "ready" || f.status === "failed";
  const panelOpen = open && inspectable;

  async function togglePanel() {
    if (open) {
      setEditing(false);
      setOpen(false);
      return;
    }
    setOpen(true);
    if (f.status === "ready" && text === undefined) {
      setLoadingText(true);
      const res = await getContributionText(classId, f.id);
      if ("text" in res) setText(res.text);
      setLoadingText(false);
    }
  }

  function startEdit() {
    setDName(f.name);
    setDMethod(f.method);
    setDText(text ?? "");
    setEditing(true);
  }

  const dirty =
    dName.trim() !== f.name || dMethod !== f.method || dText !== (text ?? "");

  async function save() {
    if (!dName.trim() || saving) return;
    setSaving(true);
    const methodChanged = dMethod !== f.method;

    const res = await editContribution(classId, topicId, f.id, {
      name: dName.trim(),
      extractionMethod: dMethod,
      text: methodChanged ? undefined : dText,
    });

    if ("error" in res) {
      toast.error(res.error);
      setSaving(false);
      return;
    }

    if (methodChanged) {
      const rr = await restartExtraction(classId, topicId, f.id);
      if ("error" in rr) {
        toast.error(rr.error);
        setSaving(false);
        return;
      }
      onUpdate(f.id, {
        name: dName.trim(),
        method: dMethod,
        status: "processing",
        manuallyEdited: true,
      });
      setText(undefined);
      setOpen(false);
      toast.success("Saved — re-extracting with new method.");
    } else {
      const wasFailedWithText =
        f.status === "failed" && dText.trim().length > 0;
      onUpdate(f.id, {
        name: dName.trim(),
        manuallyEdited: true,
        ...(wasFailedWithText ? { status: "ready", failureReason: null } : {}),
      });
      setText(dText);
      toast.success("Source updated.");
      setEditing(false);
    }

    setSaving(false);
  }

  async function retry() {
    setRetrying(true);
    const res = await restartExtraction(classId, topicId, f.id);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      onUpdate(f.id, { status: "processing", failureReason: null });
      setText(undefined);
      setOpen(false);
      toast.success("Re-extracting…");
    }
    setRetrying(false);
  }

  return (
    <>
      <div className={`file${panelOpen ? " expanded" : ""}`}>
        <span className={`ftype ${f.type}`}>{TYPE_LABEL[f.type]}</span>
        <div className="finfo">
          <button className="fname-link" onClick={() => onOpen(f.id)}>
            <span className="fname">{f.name}</span>
          </button>
          <div className="fmeta">
            Added by <b>{f.uploaderId === currentUserId ? "You" : f.who}</b> ·{" "}
            {timeAgo(f.createdAt)} ·{" "}
            <span className="method-tag">{EXTRACTION_LABELS[f.method]}</span>
            {f.manuallyEdited && <span className="method-tag"> · Edited</span>}
          </div>
        </div>
        <div className="file-actions">
          {!panelOpen && (
            <StatusPill status={f.status} failureReason={f.failureReason} />
          )}
          {inspectable && (
            <button
              className="icon-btn"
              title={panelOpen ? "Close" : "Inspect extraction"}
              style={panelOpen ? { color: "var(--accent-text)" } : undefined}
              onClick={togglePanel}
            >
              <InspectIcon />
            </button>
          )}
          {canDelete && (
            <button className="icon-btn" onClick={() => onRemove(f.name, f.id)}>
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {panelOpen && (
        <div className="inspect">
          <div className="inspect-inner">
            {editing ? (
              <>
                <div className="inspect-bar">
                  <span className="il">Edit source</span>
                  <div className="inspect-actions">
                    <button
                      className="ibtn ibtn-cancel"
                      onClick={() => setEditing(false)}
                    >
                      <XIcon />
                      Cancel
                    </button>
                    <button
                      className="ibtn ibtn-save"
                      onClick={save}
                      disabled={!dirty || !dName.trim() || saving}
                    >
                      <CheckIcon />
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                <div className="iform">
                  <div className="iform-fld">
                    <label>Name</label>
                    <input
                      className="tin"
                      value={dName}
                      onChange={(e) => setDName(e.target.value)}
                      placeholder="Source name"
                    />
                  </div>
                  {f.type !== "custom" && (
                    <div className="iform-fld">
                      <label>Extraction method</label>
                      <select
                        className="tsel"
                        value={dMethod}
                        disabled={methods.length === 1}
                        onChange={(e) => setDMethod(e.target.value as EMethod)}
                      >
                        {methods.map((m) => (
                          <option key={m} value={m}>
                            {EXTRACTION_LABELS[m]}
                          </option>
                        ))}
                      </select>
                      <div className="iform-hint">
                        {methods.length > 1
                          ? "Changing this will re-extract on save."
                          : "Only one method applies to this source type."}
                      </div>
                    </div>
                  )}
                  <div className="iform-fld">
                    <label>Extracted text</label>
                    <textarea
                      className="extracted-edit"
                      value={dText}
                      onChange={(e) => setDText(e.target.value)}
                      spellCheck={false}
                      placeholder={
                        f.status === "failed"
                          ? "Extraction failed — you can paste a manual transcript here."
                          : "Extracted text…"
                      }
                    />
                  </div>
                </div>
              </>
            ) : f.status === "failed" ? (
              <>
                <div className="inspect-bar">
                  <span className="il">Extraction result</span>
                  <span className="status fail">
                    <WarnIcon />
                    Failed
                  </span>
                  <span className="inspect-meta">
                    <b>{EXTRACTION_LABELS[f.method]}</b>
                  </span>
                  <div className="inspect-actions">
                    <button className="ibtn ibtn-edit" onClick={startEdit}>
                      <EditPencilIcon />
                      Edit
                    </button>
                    <button
                      className="ibtn ibtn-edit"
                      onClick={retry}
                      disabled={retrying}
                    >
                      <RetryIcon />
                      {retrying ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                </div>
                <div className="fail-box">
                  <span className="fail-box-ic">
                    <WarnIcon size={18} />
                  </span>
                  <div>
                    <div className="fail-box-title">
                      Failed to extract text from this source
                    </div>
                    <div className="fail-box-reason">
                      {f.failureReason ?? "Unknown error."}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="inspect-bar">
                  {f.type !== "custom" && (
                    <span className="il">Extraction result</span>
                  )}
                  <span className="status done">
                    <CheckIcon />
                    Ready
                  </span>
                  {f.type !== "custom" && (
                    <span className="inspect-meta">
                      <b>{EXTRACTION_LABELS[f.method]}</b>
                      {text != null &&
                        ` · ${text.length.toLocaleString()} chars`}
                    </span>
                  )}
                  {f.type === "custom" && text != null && (
                    <span className="inspect-meta">
                      {text.length.toLocaleString()} chars
                    </span>
                  )}
                  <div className="inspect-actions">
                    <button
                      className="ibtn ibtn-edit"
                      onClick={copyText}
                      disabled={loadingText || !text}
                    >
                      <CopyIcon /> {copied ? "Copied!" : "Copy"}
                    </button>
                    {f.type !== "custom" && (
                      <button
                        className="ibtn ibtn-edit"
                        onClick={retry}
                        disabled={retrying || loadingText}
                      >
                        <RetryIcon />
                        {retrying ? "Re-extracting…" : "Re-extract"}
                      </button>
                    )}
                    <button
                      className="ibtn ibtn-edit"
                      onClick={startEdit}
                      disabled={loadingText}
                    >
                      <EditPencilIcon />
                      Edit
                    </button>
                  </div>
                </div>
                {loadingText ? (
                  <div
                    className="extracted"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    Loading…
                  </div>
                ) : (
                  <div className="extracted">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {text ?? ""}
                    </ReactMarkdown>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

type Props = {
  contributions: ContributionRow[];
  canUpload: boolean;
  canDelete: boolean;
  topicId: string;
  classId: string;
  currentUserId: string;
};

export default function CollectionView({
  contributions,
  canUpload,
  canDelete,
  topicId,
  classId,
  currentUserId,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileRow[]>(
    contributions.map((c) => ({
      id: c.contributionId,
      type: c.contributionType,
      name: c.contributionName,
      who: c.uploaderName,
      uploaderId: c.uploaderId,
      createdAt: c.createdAt,
      method: c.extractionMethod,
      status: c.status,
      failureReason: c.failureReason,
      manuallyEdited: c.manuallyEdited,
      isCompiled: c.isCompiled,
    })),
  );
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customText, setCustomText] = useState("");
  const [stagingState, setStagingState] = useState<
    Record<number, "uploading" | "error">
  >({});

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!filesRef.current.some((f) => f.status === "processing")) return;

      const result = await getContributionStatuses(classId, topicId);
      if ("error" in result) return;

      const byId = new Map(result.statuses.map((s) => [s.id, s]));
      setFiles((fs) =>
        fs.map((f) => {
          const s = byId.get(f.id);
          if (!s) return f;
          return {
            ...f,
            name: s.name,
            status: s.status,
            failureReason: s.failureReason,
          };
        }),
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [classId, topicId]);

  function detectType(file: File): CType {
    if (file.type === "application/pdf") return "pdf";
    if (
      file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      return "pdf";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (
      file.type === "text/plain" ||
      file.type === "text/markdown" ||
      file.type === "text/x-markdown"
    )
      return "text";
    return "pdf";
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function stageFiles(rawFiles: File[]) {
    const items: StagedFile[] = rawFiles.map((f) => {
      const type = detectType(f);
      return {
        id: ++stageSeq,
        kind: "file",
        type,
        name: f.name,
        size: formatSize(f.size),
        method: METHODS_FOR_TYPE[type][0],
        file: f,
      };
    });
    setStaged((st) => [...st, ...items]);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      stageFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  }

  function isStagedUrl(u: string): boolean {
    return staged.some((s) => {
      if (s.kind === "link") return s.url === u;
      if (s.kind === "playlist") return s.videos.some((v) => v.url === u);
      return false;
    });
  }

  async function stageLink() {
    if (!url.trim() || resolvingLink) return;
    const normalizedUrl = url.trim().match(/^https?:\/\//)
      ? url.trim()
      : `https://${url.trim()}`;
    const isPlaylist = /[?&]list=|playlist/i.test(normalizedUrl);
    if (isPlaylist) {
      setResolvingLink(true);
      const playlist = await getPlaylistInfo(normalizedUrl);
      setResolvingLink(false);
      if ("error" in playlist) return toast.error(playlist.error);
      const fresh = playlist.videos.filter((v) => !isStagedUrl(v.url));
      const skipped = playlist.videos.length - fresh.length;
      if (fresh.length === 0) {
        toast.error("All videos in this playlist are already staged.");
        return;
      }
      if (skipped > 0)
        toast.warning(
          `${skipped} already-staged video${skipped > 1 ? "s" : ""} skipped.`,
        );
      const videos = fresh.map((v) => ({
        id: ++stageSeq,
        ...v,
        checked: true,
      }));
      setStaged((st) => [
        ...st,
        {
          id: ++stageSeq,
          kind: "playlist",
          name: playlist.name,
          url: normalizedUrl.replace(/^https?:\/\//, ""),
          videos,
          collapsed: false,
        },
      ]);
    } else {
      if (isStagedUrl(normalizedUrl)) {
        toast.error("This link is already staged.");
        return;
      }
      const type: CType = /youtu/i.test(normalizedUrl) ? "youtube" : "link";
      if (type === "youtube") {
        setResolvingLink(true);
        const video = await getVideoInfo(normalizedUrl);
        setResolvingLink(false);
        if ("error" in video) return toast.error(video.error);
        setStaged((st) => [
          ...st,
          {
            id: ++stageSeq,
            kind: "link",
            type,
            name: video.title,
            dur: video.duration,
            url: normalizedUrl,
            method: METHODS_FOR_TYPE[type][0],
          },
        ]);
      } else {
        setStaged((st) => [
          ...st,
          {
            id: ++stageSeq,
            kind: "link",
            type,
            name: normalizedUrl.replace(/^https?:\/\//, ""),
            url: normalizedUrl,
            method: METHODS_FOR_TYPE[type][0],
          },
        ]);
      }
    }
    setUrl("");
  }

  function stageCustom() {
    if (!customText.trim()) return;
    const name = customName.trim() || "Custom note";
    setStaged((st) => [
      ...st,
      {
        id: ++stageSeq,
        kind: "file",
        type: "custom",
        name,
        size: `${customText.trim().length.toLocaleString()} chars`,
        method: "text_extraction",
        file: undefined,
        text: customText.trim(),
      } as StagedFile,
    ]);
    setCustomName("");
    setCustomText("");
    setCustomOpen(false);
  }

  const unstage = (id: number) =>
    setStaged((st) => st.filter((s) => s.id !== id));

  const setMethod = (id: number, method: EMethod) =>
    setStaged((st) =>
      st.map((s) =>
        s.id === id && s.kind !== "playlist" ? { ...s, method } : s,
      ),
    );

  const togglePlaylist = (id: number) =>
    setStaged((st) =>
      st.map((s) =>
        s.id === id && s.kind === "playlist"
          ? { ...s, collapsed: !s.collapsed }
          : s,
      ),
    );

  const toggleVideo = (pid: number, vid: number) =>
    setStaged((st) =>
      st.map((s) =>
        s.id === pid && s.kind === "playlist"
          ? {
              ...s,
              videos: s.videos.map((v) =>
                v.id === vid ? { ...v, checked: !v.checked } : v,
              ),
            }
          : s,
      ),
    );

  const toggleAllVideos = (pid: number) =>
    setStaged((st) =>
      st.map((s) => {
        if (s.id !== pid || s.kind !== "playlist") return s;
        const allOn = s.videos.every((v) => v.checked);
        return {
          ...s,
          videos: s.videos.map((v) => ({ ...v, checked: !allOn })),
        };
      }),
    );

  async function uploadFile(s: StagedFile) {
    setStagingState((st) => ({ ...st, [s.id]: "uploading" }));

    const created =
      s.type === "custom"
        ? await createCustomContribution(classId, topicId, {
            name: s.name,
            text: s.text || "",
          })
        : await createContribution(classId, topicId, {
            name: s.name,
            type: s.type,
            extractionMethod: s.method,
            file: s.file,
          });

    if ("error" in created) {
      setStagingState((st) => ({ ...st, [s.id]: "error" }));
      toast.error(`Something went wrong while uploading ${s.name}.`);
      return;
    }

    toast.success(`Successfully uploaded ${s.name}.`);
    setStaged((st) => st.filter((x) => x.id !== s.id));
    setFiles((fs) => [
      {
        id: created.id,
        type: s.type,
        name: s.name,
        who: "You",
        uploaderId: currentUserId,
        createdAt: created.createdAt,
        method: s.method,
        status: s.type === "custom" ? "ready" : "processing",
        failureReason: null,
        manuallyEdited: false,
        isCompiled: false,
      },
      ...fs,
    ]);
  }

  async function uploadLink(s: StagedLink) {
    setStagingState((st) => ({ ...st, [s.id]: "uploading" }));

    const created = await createContribution(classId, topicId, {
      name: s.name,
      type: s.type,
      extractionMethod: s.method,
      url: s.url,
    });

    if ("error" in created) {
      setStagingState((st) => ({ ...st, [s.id]: "error" }));
      toast.error(created.error);
      return;
    }

    toast.success(`Successfully added ${s.name}.`);
    setStaged((st) => st.filter((x) => x.id !== s.id));
    setFiles((fs) => [
      {
        id: created.id,
        type: s.type,
        name: s.name,
        who: "You",
        uploaderId: currentUserId,
        createdAt: created.createdAt,
        method: s.method,
        status: "processing",
        failureReason: null,
        manuallyEdited: false,
        isCompiled: false,
      },
      ...fs,
    ]);
  }

  async function uploadPlaylist(s: StagedPlaylist) {
    setStagingState((st) => ({ ...st, [s.id]: "uploading" }));

    const checked = s.videos.filter((v) => v.checked);
    const results = await Promise.all(
      checked.map((v) =>
        createContribution(classId, topicId, {
          name: v.title,
          type: "youtube",
          extractionMethod: "youtube_transcript",
          url: v.url,
        }),
      ),
    );

    const created = results.filter(
      (r): r is { id: string; createdAt: string } => !("error" in r),
    );
    if (created.length < checked.length) {
      setStagingState((st) => ({ ...st, [s.id]: "error" }));
      toast.error(`Some videos in ${s.name} failed to add.`);
    } else {
      toast.success(`Successfully added ${s.name}.`);
      setStaged((st) => st.filter((x) => x.id !== s.id));
    }

    setFiles((fs) => [
      ...created.map((c, i) => ({
        id: c.id,
        type: "youtube" as CType,
        name: checked[i].title,
        who: "You",
        uploaderId: currentUserId,
        createdAt: c.createdAt,
        method: "youtube_transcript" as EMethod,
        status: "processing" as PStatus,
        failureReason: null,
        manuallyEdited: false,
        isCompiled: false,
      })),
      ...fs,
    ]);
  }

  async function uploadAll() {
    if (uploading) return;
    setUploading(true);

    await Promise.all(
      staged.map((s) => {
        if (s.kind === "playlist") return uploadPlaylist(s);
        if (s.kind === "link") return uploadLink(s);
        return uploadFile(s);
      }),
    );

    setUploading(false);
  }

  async function removeFile(name: string, id: string) {
    const res = await deleteContribution(classId, id);
    if ("error" in res) return toast.error(res.error);
    setFiles((fs) => fs.filter((f) => f.id !== id));
    toast.success(`Successfully deleted ${name} from the collection.`);
  }

  async function openContribution(id: string) {
    const result = await getContributionUrl(classId, id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function updateFile(id: string, patch: Partial<FileRow>) {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  const uncompiled = files.filter(
    (f) => !f.isCompiled && f.status === "ready",
  ).length;
  const processing = files.filter((f) => f.status === "processing").length;
  const stagedSize = staged.reduce(
    (n, s) =>
      s.kind === "playlist"
        ? n + s.videos.filter((v) => v.checked).length
        : n + 1,
    0,
  );
  const uniqueContributors = new Set(files.map((f) => f.uploaderId)).size;

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <div className="kicker">Collection</div>
          <h1 className="pane-title">Shared sources</h1>
          <p className="pane-desc">
            Everything the class has contributed for this topic. Every ready
            source is included in the next compile — remove anything you
            don&apos;t want.
          </p>
        </div>
      </div>

      {/* stat chips */}
      <div className="flex flex-wrap gap-2 mb-4.5">
        <span className="chip">
          <b>{files.length}</b> sources
        </span>
        <span
          className={`chip${uncompiled > 0 ? " text-(--accent-text) border-(--accent) bg-(--accent-soft)" : ""}`}
        >
          <b>{uncompiled}</b> uncompiled
        </span>
        {processing > 0 && (
          <span className="chip text-(--accent-text)">
            <span className="spin-amber" />
            <b>{processing}</b> processing
          </span>
        )}
        <span className="chip">
          <b>{uniqueContributors}</b> contributors
        </span>
      </div>

      {/* upload area */}
      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.txt,.md,.markdown,image/*,audio/*"
            onChange={handleFileInput}
          />
          <div
            className={`dropzone${drag ? " drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (e.dataTransfer.files.length) {
                stageFiles(Array.from(e.dataTransfer.files));
              }
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-ic">
              <UploadIcon />
            </div>
            <h4>Drop files here, or click to select</h4>
            <p>PDF, DOCX, TXT, MD, image, MP3, M4A, WAV · up to 50 MB each</p>
          </div>

          <div className="flex gap-2.5 my-3.5">
            <div className="flex flex-1 items-center gap-2.5 bg-(--paper) border border-(--line) rounded-[10px] py-0.75 pl-3.25 pr-1">
              <span className="text-(--ink-fainter) flex shrink-0">
                <LinkIcon />
              </span>
              <input
                className="flex-1 border-none bg-transparent outline-none text-[13px] text-(--ink) py-2.5 placeholder:text-(--ink-fainter)"
                placeholder="Paste a YouTube video, playlist, or article link…"
                value={url}
                disabled={resolvingLink}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && stageLink()}
              />
            </div>
            <button
              className="btn btn-ghost"
              onClick={stageLink}
              disabled={resolvingLink}
            >
              {resolvingLink ? (
                <>
                  <span className="mini-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <PlusIcon />
                  Add link
                </>
              )}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setCustomOpen((o) => !o)}
            >
              <PlusIcon />
              Add custom
            </button>
          </div>

          {customOpen && (
            <div className="max-w-none bg-(--paper-raised) border border-(--line) rounded-[15px] overflow-hidden my-3">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-(--line-soft)">
                <span className="text-[13px] font-semibold text-(--ink-heading)">
                  Add custom text
                </span>
                <span className="ml-auto text-[12px] text-(--ink-faint)">
                  Typed in directly — no extraction needed
                </span>
              </div>
              <div className="flex flex-col gap-3.5 p-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-(--ink-nav) mb-1.5">
                    Name
                  </label>
                  <input
                    className="tin w-full"
                    placeholder="e.g. My summary notes"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-(--ink-nav) mb-1.5">
                    Text
                  </label>
                  <textarea
                    className="extracted-edit border border-(--line) rounded-[9px] min-h-35"
                    placeholder="Write or paste your notes here…"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[12px] text-(--ink-faint) mr-auto">
                    {customText.trim().length.toLocaleString()} characters
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setCustomOpen(false);
                      setCustomName("");
                      setCustomText("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={stageCustom}
                    disabled={!customText.trim()}
                  >
                    <PlusIcon />
                    Add to selection
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* staging area */}
      {staged.length > 0 && (
        <div className="rounded-[15px] bg-(--paper-raised) my-3.5 border border-(--accent) overflow-hidden shadow-[0_0_0_3px_var(--accent-soft)]">
          <div className="flex items-center gap-2.5 px-4 py-3.25 border-b border-(--line-soft)">
            <span className="text-[13px] font-semibold text-(--ink-heading)">
              Ready to upload
            </span>
            <span className="chip px-2.25 py-0.75">
              <b>{stagedSize}</b> selected
            </span>
            <span className="ml-auto text-[12px] text-(--ink-faint)">
              Pick how each is read, then upload
            </span>
          </div>

          {staged.map((s) =>
            s.kind === "playlist" ? (
              <div key={s.id}>
                <div className="pl-head">
                  <span className="ftype youtube">YT</span>
                  <button
                    className="pl-open"
                    onClick={() => togglePlaylist(s.id)}
                  >
                    <span className={`pl-chev${s.collapsed ? "" : " open"}`}>
                      <ChevIcon />
                    </span>
                    <span className="min-w-0">
                      <div className="pl-name">{s.name}</div>
                      <div className="pl-sub">
                        Playlist · {s.videos.filter((v) => v.checked).length} of{" "}
                        {s.videos.length} videos · YouTube transcript
                      </div>
                    </span>
                  </button>
                  {(() => {
                    const on = s.videos.filter((v) => v.checked).length;
                    const all = on === s.videos.length;
                    const some = on > 0 && !all;
                    return (
                      <span
                        className={`cbox${all ? " on" : some ? " some" : ""}`}
                        onClick={() => toggleAllVideos(s.id)}
                      >
                        {all ? (
                          <CheckIcon />
                        ) : some ? (
                          <span className="dash" />
                        ) : null}
                      </span>
                    );
                  })()}
                  <button
                    className="icon-btn"
                    onClick={() => unstage(s.id)}
                    disabled={uploading}
                  >
                    <TrashIcon />
                  </button>
                </div>
                {!s.collapsed && (
                  <div className="pl-videos">
                    {s.videos.map((v) => (
                      <div className="pl-video" key={v.id}>
                        <span
                          className={`cbox${v.checked ? " on" : ""}`}
                          onClick={() => !uploading && toggleVideo(s.id, v.id)}
                        >
                          {v.checked && <CheckIcon />}
                        </span>
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span
                            className={`pl-vtitle${v.checked ? "" : " off"}`}
                          >
                            {v.title}
                          </span>
                        </a>
                        <span className="pl-vdur">{v.dur}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="file" key={s.id}>
                <span className={`ftype ${s.type}`}>
                  {TYPE_LABEL[s.type as CType]}
                </span>
                <div className="finfo">
                  <div className="fname">{s.name}</div>
                  <div className="fmeta">
                    {s.kind === "link"
                      ? "Link"
                      : s.type === "custom"
                        ? "Custom"
                        : "File"}
                    {s.kind === "link" && s.dur ? ` · ${s.dur}` : ""}
                    {stagingState[s.id] === "error" && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-(--danger) font-semibold">
                          error
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="file-actions">
                  {METHODS_FOR_TYPE[s.type as CType].length > 1 && (
                    <div className="method-wrap">
                      <select
                        className="method-select"
                        value={s.method}
                        disabled={uploading}
                        onChange={(e) =>
                          setMethod(s.id, e.target.value as EMethod)
                        }
                      >
                        {METHODS_FOR_TYPE[s.type as CType].map((m) => (
                          <option key={m} value={m}>
                            {EXTRACTION_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    className="icon-btn text-(--ink-fainter)"
                    onClick={() => unstage(s.id)}
                    disabled={uploading}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ),
          )}

          <div className="flex items-start gap-3 px-4 py-3.25 bg-(--paper-deep) border-t border-(--line-soft)">
            <span className="flex items-start gap-2 text-[12.5px] text-(--ink-faint) leading-[1.45] flex-1">
              <span className="shrink-0 text-(--accent-text) mt-px">
                <InfoIcon />
              </span>
              Sources show as Processing while we extract their text — this
              usually takes a few moments, and they&apos;ll switch to Ready on
              their own.
            </span>
            {!uploading && (
              <button className="btn btn-ghost" onClick={() => setStaged([])}>
                Clear
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={uploadAll}
              disabled={uploading || resolvingLink || stagedSize === 0}
            >
              {uploading ? (
                <>
                  <span className="mini-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <UploadIcon />
                  Upload {stagedSize} {stagedSize === 1 ? "source" : "sources"}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* committed sources */}
      <div className="section-label mt-6.5">All sources</div>
      {files.length === 0 ? (
        <div className="empty">
          <div className="empty-ic">
            <CollectionIcon />
          </div>
          <h3>No sources yet</h3>
          <p>
            Upload PDFs, audio recordings, images, or paste a link to get
            started.
          </p>
        </div>
      ) : (
        <div className="rounded-[15px] bg-(--paper-raised) border border-(--line) overflow-hidden">
          {files.map((f) => (
            <SourceRow
              key={f.id}
              f={f}
              currentUserId={currentUserId}
              classId={classId}
              topicId={topicId}
              canDelete={canDelete}
              onOpen={openContribution}
              onRemove={removeFile}
              onUpdate={updateFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
