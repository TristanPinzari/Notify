"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ContextFilterBar } from "@/components/context-filter-bar";
import type { CType, CStatus, EMethod } from "@/server/db/schema";
import {
  createContribution,
  createCustomContribution,
  deleteContribution,
  editContribution,
  getContributionStatuses,
  getContributionText,
  getContributionUrl,
  restartExtraction,
  setContributionPin,
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
  PinIcon,
  MembersIcon,
  ChevronExtIcon,
  MicIcon,
  PauseIcon,
  StopSquareIcon,
  PlaySolidIcon,
  WaveformIcon,
} from "@/components/icons";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { timeAgo } from "@/lib/utils";

const POLL_INTERVAL_MS = 5000;

export type ContributionRow = {
  contributionId: string;
  contributionName: string;
  contributionType: CType;
  extractionMethod: EMethod;
  status: CStatus;
  failureReason: string | null;
  manuallyEdited: boolean;
  pinned: boolean;
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
  status: CStatus;
  failureReason: string | null;
  manuallyEdited: boolean;
  pinned: boolean;
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

function fmtRecTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type RecordStage = "idle" | "recording" | "paused" | "review" | "added";
const WAVE_BAR_COUNT = 32;

function defaultRecordingName() {
  return `Recording · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function RecordPanel({
  name,
  setName,
  onAdd,
}: {
  name: string;
  setName: (n: string) => void;
  onAdd: (file: File) => void;
}) {
  const [stage, setStage] = useState<RecordStage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDur, setAudioDur] = useState(0);
  const [waveBars, setWaveBars] = useState<number[]>(
    Array(WAVE_BAR_COUNT).fill(6),
  );

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const audioBlobRef = useRef<Blob | null>(null);
  const [addedDuration, setAddedDuration] = useState(0);

  useEffect(() => {
    const url = blobUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (stage !== "recording") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      void audioCtxRef.current?.close();
      mrRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleTrackSeek(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * effectiveDur;
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }

  function startVisualizer() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const binCount = analyser.frequencyBinCount;
    const nyquist = analyser.context.sampleRate / 2;
    const dataArr = new Uint8Array(binCount);
    const bars = new Array<number>(WAVE_BAR_COUNT);
    const MIN_HZ = 80;
    const MAX_HZ = 8000;
    const bin0s = new Int32Array(WAVE_BAR_COUNT);
    const bin1s = new Int32Array(WAVE_BAR_COUNT);
    for (let i = 0; i < WAVE_BAR_COUNT; i++) {
      const hz0 = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / WAVE_BAR_COUNT);
      const hz1 = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (i + 1) / WAVE_BAR_COUNT);
      bin0s[i] = Math.max(0, Math.floor((hz0 / nyquist) * binCount));
      bin1s[i] = Math.min(binCount - 1, Math.ceil((hz1 / nyquist) * binCount));
    }
    function tick() {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArr);
      for (let i = 0; i < WAVE_BAR_COUNT; i++) {
        let peak = 0;
        for (let j = bin0s[i]!; j <= bin1s[i]!; j++) {
          if (dataArr[j]! > peak) peak = dataArr[j]!;
        }
        bars[i] = 4 + (peak / 255) * 44;
      }
      setWaveBars([...bars]);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        cancelAnimationFrame(animFrameRef.current);
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        audioBlobRef.current = blob;
        setBlobUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        setStage("review");
      };
      mr.start(100);
      setElapsed(0);
      if (!name.trim()) setName(defaultRecordingName());
      setStage("recording");
      startVisualizer();
    } catch {
      toast.error("Microphone access denied.");
    }
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function redo() {
    cancelAnimationFrame(animFrameRef.current);
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    audioBlobRef.current = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setElapsed(0);
    setPlaying(false);
    setCurrentTime(0);
    setAudioDur(0);
    setWaveBars(Array(WAVE_BAR_COUNT).fill(6));
    setStage("idle");
  }

  function add() {
    const blob = audioBlobRef.current;
    if (!blob) return;
    const displayName = name.trim() || defaultRecordingName();
    const file = new File([blob], displayName, { type: blob.type });
    setAddedDuration(elapsed);
    onAdd(file);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    audioBlobRef.current = null;
    setBlobUrl(null);
    setElapsed(0);
    setPlaying(false);
    setCurrentTime(0);
    setAudioDur(0);
    setName("");
    setStage("added");
  }

  const effectiveDur = audioDur > 0 && isFinite(audioDur) ? audioDur : elapsed;
  const scrubPct =
    effectiveDur > 0 ? Math.min((currentTime / effectiveDur) * 100, 100) : 0;

  if (stage === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 py-7 bg-(--paper) border border-(--line) rounded-xl">
        <button
          onClick={start}
          className="w-18 h-18 rounded-full border-none bg-(--accent) text-(--on-accent) flex items-center justify-center shadow-[0_8px_22px_-8px_rgba(196,121,24,0.55)] hover:bg-(--accent-hi) hover:scale-[1.04] transform-gpu transition-[transform,background-color] duration-150 cursor-pointer"
        >
          <MicIcon size={28} />
        </button>
        <p className="text-[13px] text-(--ink-faint) text-center max-w-70 leading-normal m-0">
          Record a lecture, voice memo, or yourself reading notes aloud.
        </p>
      </div>
    );
  }

  if (stage === "recording" || stage === "paused") {
    const paused = stage === "paused";
    return (
      <div className="flex flex-col items-center gap-4 py-5 bg-(--paper) border border-(--line) rounded-xl">
        <div className="flex items-center gap-2.5 font-mono text-[26px] font-medium text-(--ink-heading) tracking-[0.02em]">
          <span className={`rec-dot${paused ? " paused" : ""}`} />
          {fmtRecTime(elapsed)}
        </div>
        <div className={`rec-wave live${paused ? " paused" : ""}`}>
          {waveBars.map((h, i) => (
            <span key={i} style={{ height: `${h}px` }} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {paused ? (
            <button
              onClick={() => {
                mrRef.current?.resume();
                startVisualizer();
                setStage("recording");
              }}
              className="w-12 h-12 rounded-full border border-(--line-strong) bg-(--paper-raised) text-(--ink-nav) flex items-center justify-center hover:border-(--ink-fainter) hover:text-(--ink-heading) transition-all cursor-pointer"
              title="Resume"
            >
              <PlaySolidIcon size={20} />
            </button>
          ) : (
            <button
              onClick={() => {
                cancelAnimationFrame(animFrameRef.current);
                mrRef.current?.pause();
                setStage("paused");
              }}
              className="w-12 h-12 rounded-full border border-(--line-strong) bg-(--paper-raised) text-(--ink-nav) flex items-center justify-center hover:border-(--ink-fainter) hover:text-(--ink-heading) transition-all cursor-pointer"
              title="Pause"
            >
              <PauseIcon size={20} />
            </button>
          )}
          <button
            onClick={() => mrRef.current?.stop()}
            className="w-14 h-14 rounded-full border-none bg-(--danger) text-white flex items-center justify-center hover:bg-[#8f3527] transition-colors cursor-pointer"
            title="Stop"
          >
            <StopSquareIcon size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <div className="flex flex-col gap-3.5 bg-(--paper) border border-(--line) rounded-xl p-5">
        <div className="flex items-center gap-3 bg-(--paper-raised) border border-(--line) rounded-[11px] py-2.5 px-3">
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-(--accent) text-(--on-accent) border-none flex items-center justify-center cursor-pointer shrink-0"
          >
            {playing ? <PauseIcon size={14} /> : <PlaySolidIcon size={14} />}
          </button>
          <div
            className="flex-1 h-1.5 rounded-full bg-(--line-strong) relative cursor-pointer group/track"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrubbingRef.current = true;
              wasPlayingRef.current = !(audioRef.current?.paused ?? true);
              audioRef.current?.pause();
              handleTrackSeek(e);
            }}
            onPointerMove={(e) => {
              if (!scrubbingRef.current) return;
              handleTrackSeek(e);
            }}
            onPointerUp={() => {
              scrubbingRef.current = false;
              if (wasPlayingRef.current) void audioRef.current?.play();
            }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-(--accent) rounded-full pointer-events-none"
              style={{ width: `${scrubPct}%` }}
            />
            <div
              className="absolute top-1/2 w-3 h-3 rounded-full bg-(--accent) -translate-x-1/2 -translate-y-1/2 scale-0 group-hover/track:scale-100 transition-transform pointer-events-none"
              style={{ left: `${scrubPct}%` }}
            />
          </div>
          <span className="font-mono text-[11.5px] text-(--ink-faint) shrink-0">
            {fmtRecTime(Math.floor(currentTime))} /{" "}
            {fmtRecTime(Math.floor(effectiveDur))}
          </span>
        </div>
        {blobUrl && (
          <audio
            ref={audioRef}
            src={blobUrl}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setCurrentTime(0);
            }}
            onTimeUpdate={() =>
              setCurrentTime(audioRef.current?.currentTime ?? 0)
            }
            onLoadedMetadata={() => {
              const a = audioRef.current;
              if (!a) return;
              if (isFinite(a.duration)) setAudioDur(a.duration);
              else a.currentTime = 1e101;
            }}
            onDurationChange={() => {
              const d = audioRef.current?.duration;
              if (d && isFinite(d)) setAudioDur(d);
            }}
          />
        )}
        <div className="flex items-center gap-2.5">
          <button className="btn btn-ghost" onClick={redo}>
            <RetryIcon />
            Re-record
          </button>
          <button className="btn btn-primary ml-auto" onClick={add}>
            <PlusIcon />
            Add to selection
          </button>
        </div>
      </div>
    );
  }

  // added
  return (
    <div className="flex flex-col items-center gap-4 py-7 bg-(--paper) border border-(--line) rounded-xl text-center">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-(--accent-text) bg-(--accent-soft) border border-[rgba(196,121,24,0.22)] px-2.5 py-1 rounded-full">
        <WaveformIcon size={11} />
        Recording · {fmtRecTime(addedDuration)} · added to selection
      </span>
      <p className="text-[13px] text-(--ink-faint) m-0 leading-normal max-w-75">
        It&apos;ll sit in the staging area with your other sources —
        transcription runs when you upload.
      </p>
      <button className="btn btn-ghost" onClick={redo}>
        <MicIcon size={14} />
        Record another
      </button>
    </div>
  );
}

function StatusPill({
  status,
  failureReason,
}: {
  status: CStatus;
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
  if (status === "compiled")
    return (
      <span className="status compiled">
        <CheckIcon />
        Compiled
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
  canPin: boolean;
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
  canPin,
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
  const [pinning, setPinning] = useState(false);

  async function togglePin() {
    if (pinning) return;
    setPinning(true);
    const res = await setContributionPin(classId, f.id, !f.pinned);
    if ("error" in res) toast.error(res.error);
    else onUpdate(f.id, { pinned: !f.pinned });
    setPinning(false);
  }

  async function copyText() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const methods = METHODS_FOR_TYPE[f.type];
  const inspectable =
    f.status === "ready" || f.status === "compiled" || f.status === "failed";
  const panelOpen = open && inspectable;

  async function togglePanel() {
    if (open) {
      setEditing(false);
      setOpen(false);
      return;
    }
    setOpen(true);
    if (
      (f.status === "ready" || f.status === "compiled") &&
      text === undefined
    ) {
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
            Added by{" "}
            <Link
              href={`/home/${classId}/${topicId}/members?members=${f.uploaderId}&reason=who+made+this+contribution`}
            >
              <b>{f.uploaderId === currentUserId ? "You" : f.who}</b>
            </Link>{" "}
            · {timeAgo(f.createdAt)} ·{" "}
            <span className="method-tag">{EXTRACTION_LABELS[f.method]}</span>
            {f.manuallyEdited && <span className="method-tag"> · Edited</span>}
            {f.pinned && <span className="method-tag pin-tag"> · Pinned</span>}
          </div>
        </div>
        <div className="file-actions">
          {!panelOpen && (
            <StatusPill status={f.status} failureReason={f.failureReason} />
          )}
          {canPin && (
            <button
              className={`icon-btn${f.pinned ? " text-(--accent-text)" : ""}`}
              title={f.pinned ? "Unpin" : "Pin"}
              disabled={pinning}
              onClick={togglePin}
            >
              <PinIcon filled={f.pinned} />
            </button>
          )}
          {inspectable && (
            <button
              className={`icon-btn${panelOpen ? " text-(--accent-text)" : ""}`}
              title={panelOpen ? "Close" : "Inspect extraction"}
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
                  {f.status === "compiled" ? (
                    <span className="status compiled">
                      <CheckIcon />
                      Compiled
                    </span>
                  ) : (
                    <span className="status done">
                      <CheckIcon />
                      Ready
                    </span>
                  )}
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
                  <div className="extracted text-(--ink-faint)">Loading…</div>
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
  canPin: boolean;
  topicId: string;
  classId: string;
  currentUserId: string;
  highlightSources?: string[];
  filterReason?: string;
};

export default function CollectionView({
  contributions,
  canUpload,
  canDelete,
  canPin,
  topicId,
  classId,
  currentUserId,
  highlightSources,
  filterReason,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const highlightSet = useMemo(
    () => (highlightSources ? new Set(highlightSources) : null),
    [highlightSources],
  );

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
      pinned: c.pinned,
    })),
  );
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMode, setCustomMode] = useState<"text" | "record">("text");
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
        pinned: false,
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
        pinned: false,
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
        status: "processing" as CStatus,
        failureReason: null,
        manuallyEdited: false,
        pinned: false,
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

  const uncompiled = files.filter((f) => f.status === "ready").length;
  const processing = files.filter((f) => f.status === "processing").length;
  const stagedSize = staged.reduce(
    (n, s) =>
      s.kind === "playlist"
        ? n + s.videos.filter((v) => v.checked).length
        : n + 1,
    0,
  );
  const contributorIds = useMemo(
    () => [...new Set(files.map((f) => f.uploaderId))],
    [files],
  );
  const uniqueContributors = contributorIds.length;

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
        <Link
          className="chip link"
          href={
            uniqueContributors > 0
              ? `/home/${classId}/${topicId}/members?members=${contributorIds.join(",")}&reason=who+contributed+to+this+collection`
              : `/home/${classId}/${topicId}/members`
          }
        >
          <MembersIcon />
          From{" "}
          <b>
            {uniqueContributors} contributor
            {uniqueContributors !== 1 ? "s" : ""}
          </b>
          <ChevronExtIcon />
        </Link>
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

          <div className="link-row flex gap-2.5 my-3.5">
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
                  Custom
                </span>
                <div className="fmt-seg ml-auto">
                  <button
                    className={customMode === "text" ? "on" : ""}
                    onClick={() => setCustomMode("text")}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-serif), Georgia, serif",
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      T
                    </span>
                    Text
                  </button>
                  <button
                    className={customMode === "record" ? "on" : ""}
                    onClick={() => setCustomMode("record")}
                  >
                    <MicIcon size={14} />
                    Record
                  </button>
                </div>
              </div>

              {customMode === "text" ? (
                <div className="flex flex-col gap-4 p-4">
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
                        setCustomMode("text");
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
              ) : (
                <div className="flex flex-col gap-3.5 p-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-(--ink-nav) mb-1.5">
                      Name
                    </label>
                    <input
                      className="tin w-full"
                      placeholder="Auto-named from date — edit anytime"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                    />
                  </div>
                  <RecordPanel
                    name={customName}
                    setName={setCustomName}
                    onAdd={(file) => {
                      stageFiles([file]);
                      setCustomName("");
                      setCustomOpen(false);
                      setCustomMode("text");
                    }}
                  />
                </div>
              )}
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
      {highlightSources && (
        <ContextFilterBar
          noun="source"
          count={highlightSources.length}
          total={files.length}
          filterReason={filterReason ?? ""}
          exists={files.filter((f) => highlightSet!.has(f.id)).length}
          onClear={() => {
            const p = new URLSearchParams(searchParams);
            p.delete("sources");
            p.delete("reason");
            router.replace(pathname + (p.size ? `?${p}` : ""), {
              scroll: false,
            });
          }}
        />
      )}
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
          {files
            .filter((f) => !highlightSet || highlightSet.has(f.id))
            .map((f) => (
              <SourceRow
                key={f.id}
                f={f}
                currentUserId={currentUserId}
                classId={classId}
                topicId={topicId}
                canDelete={canDelete}
                canPin={canPin}
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
