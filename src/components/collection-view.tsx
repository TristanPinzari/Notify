"use client";

import { useState, useRef, useEffect } from "react";
import type { CType, EMethod, PStatus } from "@/server/db/schema";
import {
  createContribution,
  deleteContribution,
  getContributionStatuses,
  getContributionUrl,
} from "@/server/actions/contributions";
import { toast } from "sonner";
import { getPlaylistInfo, getVideoInfo } from "@/server/actions/youtube";

const POLL_INTERVAL_MS = 10000;

export type ContributionRow = {
  contributionId: string;
  contributionName: string;
  contributionType: CType;
  extractionMethod: EMethod;
  isCompiled: boolean;
  status: PStatus;
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
};

type FileRow = {
  id: string;
  type: CType;
  name: string;
  who: string;
  createdAt: string;
  method: EMethod;
  status: PStatus;
  isCompiled: boolean;
};

type StagedFile = {
  id: number;
  kind: "file";
  type: CType;
  name: string;
  size: string;
  method: EMethod;
  file: File;
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

function StatusPill({ status }: { status: PStatus }) {
  if (status === "processing")
    return (
      <span className="status proc">
        <span className="spin-amber" />
        Processing
      </span>
    );
  if (status === "failed")
    return (
      <span className="status fail">
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

type Props = {
  contributions: ContributionRow[];
  canUpload: boolean;
  canDelete: boolean;
  topicId: string;
  classId: string;
};

export default function CollectionView({
  contributions,
  canUpload,
  canDelete,
  topicId,
  classId,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileRow[]>(
    contributions.map((c) => ({
      id: c.contributionId,
      type: c.contributionType,
      name: c.contributionName,
      who: c.uploaderName,
      createdAt: c.createdAt,
      method: c.extractionMethod,
      status: c.status,
      isCompiled: c.isCompiled,
    })),
  );
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);
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

      const byId = new Map(result.statuses.map((s) => [s.id, s.status]));
      setFiles((fs) =>
        fs.map((f) => (byId.has(f.id) ? { ...f, status: byId.get(f.id)! } : f)),
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [classId, topicId]);

  function detectType(file: File): CType {
    if (file.type === "application/pdf") return "pdf";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
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
    const isPlaylist = /[?&]list=|playlist/i.test(url);
    if (isPlaylist) {
      setResolvingLink(true);
      const playlist = await getPlaylistInfo(url);
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
          url: url.replace(/^https?:\/\//, ""),
          videos,
          collapsed: false,
        },
      ]);
    } else {
      if (isStagedUrl(url)) {
        toast.error("This link is already staged.");
        return;
      }
      const type: CType = /youtu/i.test(url) ? "youtube" : "link";
      if (type === "youtube") {
        setResolvingLink(true);
        const video = await getVideoInfo(url);
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
            url,
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
            name: url.replace(/^https?:\/\//, ""),
            url,
            method: METHODS_FOR_TYPE[type][0],
          },
        ]);
      }
    }
    setUrl("");
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

    const created = await createContribution(classId, topicId, {
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
        createdAt: created.createdAt,
        method: s.method,
        status: "processing",
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
        createdAt: created.createdAt,
        method: s.method,
        status: "processing",
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
        createdAt: c.createdAt,
        method: "youtube_transcript" as EMethod,
        status: "processing" as PStatus,
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
  const uniqueContributors = new Set(files.map((f) => f.who)).size;

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
          className="chip"
          style={
            uncompiled > 0
              ? {
                  color: "var(--accent-text)",
                  borderColor: "var(--accent)",
                  background: "var(--accent-soft)",
                }
              : {}
          }
        >
          <b>{uncompiled}</b> uncompiled
        </span>
        {processing > 0 && (
          <span className="chip" style={{ color: "var(--accent-text)" }}>
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
            accept=".pdf,image/*,audio/*"
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
            <p>PDF, image, audio · up to 25 MB each</p>
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
          </div>
        </>
      )}

      {/* staging area */}
      {staged.length > 0 && (
        <div
          className="rounded-[15px] bg-(--paper-raised) my-3.5 border border-(--accent) overflow-hidden"
          style={{ boxShadow: "0 0 0 3px var(--accent-soft)" }}
        >
          <div className="flex items-center gap-2.5 px-4 py-3.25 border-b border-(--line-soft)">
            <span className="text-[13px] font-semibold text-(--ink-heading)">
              Ready to upload
            </span>
            <span className="chip" style={{ padding: "3px 9px" }}>
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
                    {s.kind === "link" ? "Link" : "File"}
                    {s.kind === "link" && s.dur ? ` · ${s.dur}` : ""} ·{" "}
                    <span
                      className={
                        stagingState[s.id] === "error"
                          ? "text-(--danger) font-semibold"
                          : "text-(--accent-text) font-semibold"
                      }
                    >
                      {stagingState[s.id] === "uploading"
                        ? "uploading…"
                        : stagingState[s.id] === "error"
                          ? "error"
                          : "pending"}
                    </span>
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
              disabled={uploading || stagedSize === 0}
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
            <div className="file" key={f.id}>
              <span className={`ftype ${f.type}`}>{TYPE_LABEL[f.type]}</span>
              <div className="finfo">
                <button
                  className="fname-link"
                  onClick={() => openContribution(f.id)}
                >
                  <span className="fname">{f.name}</span>
                </button>
                <div className="fmeta">
                  Added by <b>{f.who}</b> · {timeAgo(f.createdAt)} ·{" "}
                  <span className="method-tag">
                    {EXTRACTION_LABELS[f.method]}
                  </span>
                </div>
              </div>
              <div className="file-actions">
                <StatusPill status={f.status} />
                {canDelete && (
                  <button
                    className="icon-btn"
                    style={{ color: "var(--ink-fainter)" }}
                    onClick={() => removeFile(f.name, f.id)}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- icons ---- */
function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ChevIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
function InfoIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
function CollectionIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
