"use client";

import { useMemo } from "react";
import { FlagDocIcon, ConflictSplitIcon } from "@/components/icons";

/* ─── types ─────────────────────────────────────────────────────────── */

type SrcRef = { id?: string; name: string };

type SourceReg = {
  getNum: (src: SrcRef) => number;
  list: () => { n: number; name: string; id?: string }[];
};

/* ─── helpers ───────────────────────────────────────────────────────── */

function getAttr(s: string, name: string): string | undefined {
  return s.match(new RegExp(`${name}="([^"]*)"`))?.at(1);
}

/** Remove <source .../> from text; capture the last source found */
function stripSources(text: string): { text: string; src: SrcRef | null } {
  let src: SrcRef | null = null;
  const cleaned = text.replace(/<source(\s[^>]*)?\s*\/>/g, (_, a = "") => {
    src = { id: getAttr(a, "id"), name: getAttr(a, "name") ?? "?" };
    return "";
  });
  return { text: cleaned, src };
}

function sameSource(a: SrcRef | null, b: SrcRef | null): boolean {
  if (!a || !b) return false;
  return a.id !== undefined && b.id !== undefined
    ? a.id === b.id
    : a.name === b.name;
}

function makeRegistry(): SourceReg {
  const map = new Map<string, number>();
  const nameMap = new Map<string, number>();
  const order: SrcRef[] = [];
  return {
    getNum(src) {
      const k = src.id ?? src.name;
      if (map.has(k)) return map.get(k)!;
      if (nameMap.has(src.name)) return nameMap.get(src.name)!;
      order.push(src);
      const n = order.length;
      map.set(k, n);
      nameMap.set(src.name, n);
      return n;
    },
    list() {
      return order.map((s, i) => ({ n: i + 1, name: s.name, id: s.id }));
    },
  };
}

/* ─── IR block types ────────────────────────────────────────────────── */

type LiItem = {
  text: string;
  src: SrcRef | null;
  cite: SrcRef | null;
  children: LiItem[];
};

type Block =
  | {
      kind: "h1" | "h2" | "h3" | "h4" | "p";
      text: string;
      src: SrcRef | null;
      cite: SrcRef | null;
    }
  | { kind: "li-group"; items: LiItem[] }
  | { kind: "conflict"; a?: string; b?: string; inner: string }
  | { kind: "blank" };

/* ─── parse markdown → blocks ──────────────────────────────────────── */

function parseBlocks(md: string): Block[] {
  const lines = md
    .replace(/\t/g, "  ")
    .replace(/([^\n])(\s*<conflict\b)/g, "$1\n$2")
    .replace(/(<\/conflict>)(\s*\S)/g, "$1\n$2")
    .split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*<conflict/.test(line)) {
      let buf = line;
      while (!/<\/conflict>/.test(buf) && i + 1 < lines.length) {
        i++;
        buf += "\n" + lines[i];
      }
      blocks.push({
        kind: "conflict",
        a: getAttr(buf, "a"),
        b: getAttr(buf, "b"),
        inner: buf
          .replace(/^[\s\S]*?<conflict[^>]*>/, "")
          .replace(/<\/conflict>[\s\S]*$/, "")
          .trim(),
      });
      i++;
      continue;
    }

    if (/^####\s+/.test(line)) {
      const s = stripSources(line.replace(/^####\s+/, ""));
      blocks.push({ kind: "h4", text: s.text, src: s.src, cite: null });
      i++;
      continue;
    }

    if (/^###\s+/.test(line)) {
      const s = stripSources(line.replace(/^###\s+/, ""));
      blocks.push({ kind: "h3", text: s.text, src: s.src, cite: null });
      i++;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const s = stripSources(line.replace(/^##\s+/, ""));
      blocks.push({ kind: "h2", text: s.text, src: s.src, cite: null });
      i++;
      continue;
    }

    if (/^#\s+/.test(line)) {
      const s = stripSources(line.replace(/^#\s+/, ""));
      blocks.push({ kind: "h1", text: s.text, src: s.src, cite: null });
      i++;
      continue;
    }

    if (/^\s*[*-]\s+/.test(line)) {
      const roots: LiItem[] = [];
      const stack: Array<{ item: LiItem; indent: number }> = [];
      while (i < lines.length && /^\s*[*-]\s+/.test(lines[i])) {
        const raw = lines[i];
        const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
        const s = stripSources(raw.replace(/^\s*[*-]\s+/, ""));
        const item: LiItem = {
          text: s.text,
          src: s.src,
          cite: null,
          children: [],
        };
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent)
          stack.pop();
        if (stack.length === 0) roots.push(item);
        else stack[stack.length - 1].item.children.push(item);
        stack.push({ item, indent });
        i++;
      }
      blocks.push({ kind: "li-group", items: roots });
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ kind: "blank" });
      i++;
      continue;
    }

    const s = stripSources(line);
    blocks.push({ kind: "p", text: s.text, src: s.src, cite: null });
    i++;
  }

  return blocks;
}

/* ─── citation pass ─────────────────────────────────────────────────── */
/*
 * Flattens all text-bearing blocks into a sequence, detects source runs,
 * and writes the run's SrcRef onto the LAST block of each run.
 * Blank and conflict blocks are transparent — they don't break a run.
 */
function assignCitations(blocks: Block[]): void {
  type Slot = { src: SrcRef | null; set: (c: SrcRef) => void };
  const flat: Slot[] = [];

  function flattenItem(item: LiItem) {
    flat.push({
      src: item.src,
      set: (c) => {
        item.cite = c;
      },
    });
    for (const child of item.children) flattenItem(child);
  }

  for (const b of blocks) {
    if (b.kind === "li-group") {
      for (const item of b.items) flattenItem(item);
    } else if (b.kind !== "blank" && b.kind !== "conflict") {
      const tb = b as { src: SrcRef | null; cite: SrcRef | null };
      flat.push({
        src: tb.src,
        set: (c) => {
          tb.cite = c;
        },
      });
    }
  }

  let runSrc: SrcRef | null = null;
  let runEnd = -1;

  for (let i = 0; i < flat.length; i++) {
    const src = flat[i].src;
    if (!src) continue;
    if (!sameSource(src, runSrc)) {
      if (runEnd >= 0 && runSrc) flat[runEnd].set(runSrc);
      runSrc = src;
    }
    runEnd = i;
  }
  if (runEnd >= 0 && runSrc) flat[runEnd].set(runSrc);
}

/* ─── sub-components ─────────────────────────────────────────────────── */

function SourceCite({
  n,
  name,
  href,
}: {
  n: number;
  name: string;
  href?: string;
}) {
  return (
    <a
      className="src-cite"
      href={href ?? "#"}
      onClick={(e) => !href && e.preventDefault()}
    >
      {n}
      <span className="tip">{name}</span>
    </a>
  );
}

function Flagged({
  reason,
  original,
  children,
}: {
  reason?: string;
  original?: string;
  children: React.ReactNode;
}) {
  const label = original ? "Changed · original claim" : "Flagged · verify";
  const body =
    original ??
    reason ??
    "This claim could not be confirmed against a cited source.";
  return (
    <span className="flagged">
      <span className="flag-text">{children}</span>
      <span className="fmark">
        <FlagDocIcon />
      </span>
      <span className="tip">
        <b>{label}</b>
        {body}
      </span>
    </span>
  );
}

function Conflict({
  a,
  b,
  children,
}: {
  a?: string;
  b?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="conflict">
      <div className="ch">
        <span className="ci">
          <ConflictSplitIcon />
        </span>
        <span className="lbl">Sources disagree</span>
        {(a ?? b) && (
          <span className="versus">
            {a && <span className="cside">{a}</span>}
            {a && b && <span className="vs">vs</span>}
            {b && <span className="cside">{b}</span>}
          </span>
        )}
      </div>
      <div className="cbody">{children}</div>
    </div>
  );
}

/* ─── inline renderer ───────────────────────────────────────────────── */

const INLINE_RE =
  /<flagged(\s[^>]*)?>([\s\S]*?)<\/flagged>|\*\*([^*]+)\*\*|<q>([\s\S]*?)<\/q>/;

function renderInline(text: string, k = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  while (rest.length) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[0].startsWith("<flagged")) {
      const a = m[1] ?? "";
      out.push(
        <Flagged
          key={k++}
          reason={getAttr(a, "reason")}
          original={getAttr(a, "original")}
        >
          {renderInline(m[2], k + 1000)}
        </Flagged>,
      );
    } else if (m[0].startsWith("**")) {
      out.push(<strong key={k++}>{m[3]}</strong>);
    } else {
      out.push(<q key={k++}>{m[4]}</q>);
    }
    rest = rest.slice(m.index + m[0].length);
    k++;
  }
  return out;
}

/* ─── block renderer ────────────────────────────────────────────────── */

function renderBlocks(
  blocks: Block[],
  reg: SourceReg,
  classId: string,
  topicId: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let k = 0;

  function renderItems(items: LiItem[]): React.ReactNode[] {
    return items.map((item, j) => (
      <li key={j}>
        {renderInline(item.text)}
        {cite(item.cite)}
        {item.children.length > 0 && <ul>{renderItems(item.children)}</ul>}
      </li>
    ));
  }

  function cite(src: SrcRef | null) {
    if (!src) return null;
    const n = reg.getNum(src);
    const href = src.id
      ? `/home/${classId}/${topicId}/collection?sources=${src.id}`
      : undefined;
    return <SourceCite n={n} name={src.name} href={href} />;
  }

  for (const b of blocks) {
    switch (b.kind) {
      case "h1":
        out.push(
          <h1 key={k++}>
            {renderInline(b.text)}
            {cite(b.cite)}
          </h1>,
        );
        break;
      case "h2":
        out.push(
          <h2 key={k++}>
            {renderInline(b.text)}
            {cite(b.cite)}
          </h2>,
        );
        break;
      case "h3":
        out.push(
          <h3 key={k++}>
            {renderInline(b.text)}
            {cite(b.cite)}
          </h3>,
        );
        break;
      case "h4":
        out.push(
          <h4 key={k++}>
            {renderInline(b.text)}
            {cite(b.cite)}
          </h4>,
        );
        break;
      case "p":
        out.push(
          <p key={k++}>
            {renderInline(b.text)}
            {cite(b.cite)}
          </p>,
        );
        break;
      case "li-group":
        out.push(<ul key={k++}>{renderItems(b.items)}</ul>);
        break;
      case "conflict":
        out.push(
          <Conflict key={k++} a={b.a} b={b.b}>
            {renderInline(b.inner)}
          </Conflict>,
        );
        break;
      case "blank":
        break;
    }
  }
  return out;
}

/* ─── public component ──────────────────────────────────────────────── */

export function CompiledDoc({
  markdown,
  classId,
  topicId,
  allSources,
}: {
  markdown: string;
  classId: string;
  topicId: string;
  allSources?: { id?: string; name: string }[];
}) {
  const { body, sources } = useMemo(() => {
    const reg = makeRegistry();
    for (const s of allSources ?? []) reg.getNum(s);
    const blocks = parseBlocks(markdown);
    assignCitations(blocks);
    const body = renderBlocks(blocks, reg, classId, topicId);
    return { body, sources: reg.list() };
  }, [markdown, classId, topicId, allSources]);

  return (
    <article className="doc">
      <div className="docbody">{body}</div>
      {sources.length > 0 && (
        <div className="srcfoot">
          <div className="sf-h">Sources cited</div>
          <ol>
            {sources.map((s) => {
              const href = s.id
                ? `/home/${classId}/${topicId}/collection?sources=${s.id}`
                : undefined;
              return (
                <li key={s.n}>
                  <span className="num">{s.n}</span>
                  {href ? (
                    <a href={href} className="sf-link">{s.name}</a>
                  ) : (
                    <span>{s.name}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </article>
  );
}
