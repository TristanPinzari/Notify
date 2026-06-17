"use client";

import { useState } from "react";

type Format = "bullets" | "prose" | "both";

type Props = {
  topicName: string;
  content: string | null;
  contributors: number;
  sources: number;
  lastCompiledAt: string | null;
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

const SETTINGS = [
  {
    key: "factCheck" as const,
    title: "Fact-check",
    desc: "Verify claims and flag anything unsupported.",
  },
  {
    key: "extra" as const,
    title: "Add extra context",
    desc: "Let AI fill small gaps with relevant background.",
  },
];

export function MasterDocView({
  topicName,
  content,
  contributors,
  sources,
  lastCompiledAt,
}: Props) {
  const [showConfig, setShowConfig] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [opts, setOpts] = useState({
    factCheck: true,
    extra: false,
    format: "both" as Format,
  });

  function toggle(k: "factCheck" | "extra") {
    setOpts((o) => ({ ...o, [k]: !o[k] }));
  }

  function recompile() {
    setCompiling(true);
    // TODO: call recompile server action
    setTimeout(() => setCompiling(false), 2000);
  }

  return (
    <div className="pane ruled">
      <div className="pane-head">
        <div>
          <div className="kicker">Master Document</div>
          <h1 className="pane-title">{topicName}</h1>
        </div>
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
            onClick={recompile}
            disabled={compiling}
          >
            {compiling ? (
              <>
                <span className="mini-spin" />
                Compiling…
              </>
            ) : (
              <>
                <RecompileIcon />
                Recompile
              </>
            )}
          </button>
        </div>
      </div>

      <div
        className="flex flex-wrap gap-2"
        style={{ marginBottom: showConfig ? 18 : 24 }}
      >
        <span className="chip">
          <MembersIcon />
          From{" "}
          <b>
            {contributors} classmate{contributors !== 1 ? "s" : ""}
          </b>
        </span>
        <span className="chip">
          <CollectionIcon />
          <b>
            {sources} source{sources !== 1 ? "s" : ""}
          </b>
        </span>
        {lastCompiledAt && (
          <span className="chip">
            <ClockIcon />
            Compiled <b>{timeAgo(lastCompiledAt)}</b>
          </span>
        )}
        {opts.factCheck && (
          <span className="chip ok">
            <CheckIcon />
            Fact-checked
          </span>
        )}
      </div>

      {showConfig && (
        <div className="rounded-[15px] bg-(--paper-raised) border border-(--line) px-4.5 mb-6">
          {SETTINGS.map(({ key, title, desc }) => (
            <div className="set-row" key={key}>
              <div className="set-row-label">
                <div className="set-row-title">{title}</div>
                <div className="set-row-desc">{desc}</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={opts[key]}
                  onChange={() => toggle(key)}
                />
                <span className="track" />
              </label>
            </div>
          ))}
          <div className="set-row">
            <div className="set-row-label">
              <div className="set-row-title">Format</div>
              <div className="set-row-desc">
                Read as bullet points, prose paragraphs, or a mix of both.
              </div>
            </div>
            <div className="fmt-seg">
              {(["bullets", "prose", "both"] as Format[]).map((v) => (
                <button
                  key={v}
                  className={opts.format === v ? "on" : ""}
                  onClick={() => setOpts((o) => ({ ...o, format: v }))}
                >
                  {v === "bullets"
                    ? "Bullets"
                    : v === "prose"
                      ? "Prose"
                      : "Both"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {content ? (
        <article
          className="doc"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        <div className="flex flex-col items-center text-center py-16 gap-3">
          <DocEmptyIcon />
          <p className="text-[15px] text-(--ink-heading) font-semibold m-0">
            No document yet
          </p>
          <p className="text-[13.5px] text-(--ink-faint) m-0 max-w-xs">
            Add sources in the Collection tab, then click{" "}
            <strong>Recompile</strong> to generate the master document.
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
      <path d="M20 6 9 17l-5-5" />
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
