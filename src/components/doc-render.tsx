"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  FlagDocIcon,
  ConflictSplitIcon,
  MultiSourceIcon,
  SparkleIcon,
  ResolvedDotIcon,
} from "@/components/icons";

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

function sourceHref(
  id: string | undefined,
  classId: string,
  topicId: string,
): string | undefined {
  return id && classId && topicId
    ? `/home/${classId}/${topicId}/collection?sources=${id}`
    : undefined;
}

function SourceLink({
  href,
  className,
  children,
}: {
  href?: string;
  className: string;
  children: React.ReactNode;
}) {
  return href ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

function parseSources(raw: string): SrcRef[] {
  return raw.split(",").flatMap((part) => {
    const [name, id] = part.trim().split("|");
    return name.trim() ? [{ name: name.trim(), id: id?.trim() || undefined }] : [];
  });
}

/** Remove <source .../> from text; capture all distinct sources found */
function stripSources(
  text: string,
  nameById?: Map<string, string>,
): { text: string; srcs: SrcRef[] } {
  const srcs: SrcRef[] = [];
  const seen = new Set<string>();
  const cleaned = text.replace(/\s*<source(\s[^>]*)?\s*\/>/g, (_, a = "") => {
    const id = getAttr(a, "id");
    const name =
      getAttr(a, "name") || (id ? nameById?.get(id) : undefined) || "?";
    const key = id ?? name;
    if (!seen.has(key)) {
      seen.add(key);
      srcs.push({ id, name });
    }
    return "";
  });
  return { text: cleaned, srcs };
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
  srcs: SrcRef[];
  cite: SrcRef[];
  children: LiItem[];
};

type Block =
  | {
      kind: "h1" | "h2" | "h3" | "h4" | "p";
      text: string;
      srcs: SrcRef[];
      cite: SrcRef[];
    }
  | { kind: "li-group"; items: LiItem[] }
  | { kind: "conflict"; sources: SrcRef[]; verdict?: string; inner: string }
  | { kind: "math"; tex: string }
  | { kind: "blank" };

/* ─── parse markdown → blocks ──────────────────────────────────────── */

function parseBlocks(md: string, nameById?: Map<string, string>): Block[] {
  const lines = md
    .replace(/\t/g, "  ")
    .replace(/<math(\s[^>]*)?>[\s\S]*?<\/math>/g, (m) => m.replace(/\n/g, " "))
    .replace(/([^\n])(\s*<conflict\b)/g, "$1\n$2")
    .replace(/(<\/conflict>)(\s*\S)/g, "$1\n$2")
    .split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*<math\b[^>]*display="block"/.test(line)) {
      const tex = line
        .replace(/^[\s\S]*?<math[^>]*>/, "")
        .replace(/<\/math>[\s\S]*$/, "")
        .trim();
      blocks.push({ kind: "math", tex });
      i++;
      continue;
    }

    if (/^\s*<conflict/.test(line)) {
      let buf = line;
      while (!/<\/conflict>/.test(buf) && i + 1 < lines.length) {
        i++;
        buf += "\n" + lines[i];
      }
      const rawSources = getAttr(buf, "sources") ?? "";
      const conflictSources = rawSources
        ? parseSources(rawSources)
        : [getAttr(buf, "a"), getAttr(buf, "b")]
            .filter((v): v is string => !!v)
            .map((name) => ({ name }));
      blocks.push({
        kind: "conflict",
        sources: conflictSources,
        verdict: getAttr(buf, "verdict"),
        inner: buf
          .replace(/^[\s\S]*?<conflict[^>]*>/, "")
          .replace(/<\/conflict>[\s\S]*$/, "")
          .trim(),
      });
      i++;
      continue;
    }

    const hm = line.match(/^(#{1,4})\s+(.*)/);
    if (hm) {
      const kind = `h${hm[1].length}` as "h1" | "h2" | "h3" | "h4";
      const s = stripSources(hm[2], nameById);
      blocks.push({ kind, text: s.text, srcs: s.srcs, cite: [] });
      i++;
      continue;
    }

    if (/^\s*[*-]\s+/.test(line)) {
      const roots: LiItem[] = [];
      const stack: Array<{ item: LiItem; indent: number }> = [];
      while (i < lines.length && /^\s*[*-]\s+/.test(lines[i])) {
        const raw = lines[i];
        const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
        const s = stripSources(raw.replace(/^\s*[*-]\s+/, ""), nameById);
        const item: LiItem = {
          text: s.text,
          srcs: s.srcs,
          cite: [],
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

    const s = stripSources(line, nameById);
    blocks.push({ kind: "p", text: s.text, srcs: s.srcs, cite: [] });
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
  type Slot = { srcs: SrcRef[]; set: (c: SrcRef[]) => void };
  const flat: Slot[] = [];

  function flattenItem(item: LiItem) {
    flat.push({
      srcs: item.srcs,
      set: (c) => {
        item.cite = c;
      },
    });
    for (const child of item.children) flattenItem(child);
  }

  for (const b of blocks) {
    if (b.kind === "li-group") {
      for (const item of b.items) flattenItem(item);
    } else if ("srcs" in b) {
      const tb = b as { srcs: SrcRef[]; cite: SrcRef[] };
      flat.push({
        srcs: tb.srcs,
        set: (c) => {
          tb.cite = c;
        },
      });
    }
  }

  let runSrc: SrcRef | null = null;
  let runEnd = -1;

  for (let i = 0; i < flat.length; i++) {
    const { srcs, set } = flat[i];
    if (srcs.length === 0) continue;
    if (srcs.length > 1) {
      if (runEnd >= 0 && runSrc) {
        flat[runEnd].set([runSrc]);
        runSrc = null;
        runEnd = -1;
      }
      set(srcs);
      continue;
    }
    const src = srcs[0];
    if (!sameSource(src, runSrc)) {
      if (runEnd >= 0 && runSrc) flat[runEnd].set([runSrc]);
      runSrc = src;
    }
    runEnd = i;
  }
  if (runEnd >= 0 && runSrc) flat[runEnd].set([runSrc]);
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

function SourceGroup({
  sources,
}: {
  sources: { n: number; name: string; href?: string }[];
}) {
  return (
    <span className="src-group">
      <MultiSourceIcon />
      <span className="sg-count">{sources.length}</span>
      <span className="sg-tip">
        {sources.map(({ n, name, href }) => (
          <a
            key={n}
            className="sg-item"
            href={href ?? "#"}
            onClick={(e) => !href && e.preventDefault()}
          >
            <span className="sg-n">{n}</span>
            {name}
          </a>
        ))}
      </span>
    </span>
  );
}

function Flagged({
  correction,
  original,
  children,
}: {
  correction?: string;
  original?: string;
  children: React.ReactNode;
}) {
  const tipLabel = original
    ? "Original claim"
    : correction
      ? "AI suggestion"
      : "Flagged · verify";
  const tipBody =
    original ??
    correction ??
    "This claim could not be confirmed against a cited source.";
  return (
    <span className="flagged">
      <span className="flag-text">{children}</span>
      <span className="fmark">
        <FlagDocIcon />
      </span>
      <span className="tip">
        <b>{tipLabel}</b>
        {tipBody}
      </span>
    </span>
  );
}

function renderKatex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

function MathNode({ tex, block }: { tex: string; block: boolean }) {
  const Tag = block ? "div" : "span";
  return (
    <Tag
      className={block ? "math-block" : "math-inline"}
      dangerouslySetInnerHTML={{ __html: renderKatex(tex, block) }}
    />
  );
}

function Conflict({
  sources,
  verdict,
  children,
  classId,
  topicId,
}: {
  sources: SrcRef[];
  verdict?: string;
  children: React.ReactNode;
  classId?: string;
  topicId?: string;
}) {
  return (
    <div className="conflict">
      <div className="ch">
        <span className="ci">
          <ConflictSplitIcon />
        </span>
        <span className="lbl">Sources disagree</span>
        {sources.length > 0 && (
          <span className="versus">
            {sources.map((s, i) => (
              <span key={i} className="vsitem">
                {i > 0 && <span className="vs">vs</span>}
                <SourceLink href={sourceHref(s.id, classId ?? "", topicId ?? "")} className="cside">
                  {s.name}
                </SourceLink>
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="cbody">{children}</div>
      {verdict && (
        <div className="cverdict">
          <span className="vci"><SparkleIcon size={12} /></span>
          <span className="vtxt">{verdict}</span>
        </div>
      )}
    </div>
  );
}

function Resolved({
  sources,
  conflict,
  verdict,
  children,
  classId,
  topicId,
}: {
  sources: SrcRef[];
  conflict: string;
  verdict?: string;
  children: React.ReactNode;
  classId?: string;
  topicId?: string;
}) {
  return (
    <span className="resolved" tabIndex={0}>
      {children}
      <span className="rdot" aria-hidden>
        <ResolvedDotIcon size={6} />
      </span>
      <span className="rtip" role="tooltip">
        <span className="rtip-conflict">{conflict}</span>
        {sources.length > 0 && (
          <span className="rtip-sources">
            {sources.map((s, i) => (
              <SourceLink key={i} href={sourceHref(s.id, classId ?? "", topicId ?? "")} className="rtip-src">
                {s.name}
              </SourceLink>
            ))}
          </span>
        )}
        {verdict && (
          <span className="rtip-verdict">
            <span className="rtip-vci"><SparkleIcon size={10} /></span>
            {verdict}
          </span>
        )}
      </span>
    </span>
  );
}

/* ─── inline renderer ───────────────────────────────────────────────── */

const INLINE_RE =
  /<flagged(?<flaggedAttrs>\s[^>]*)?>(?<flaggedInner>[\s\S]*?)<\/flagged>|<resolved(?<resolvedAttrs>\s[^>]*)?>(?<resolvedInner>[\s\S]*?)<\/resolved>|<math>(?<mathTex>[\s\S]*?)<\/math>|\*\*(?<boldInner>[^*]+)\*\*|<q>(?<quoteInner>[\s\S]*?)<\/q>/;

function renderInline(text: string, k = 0, classId = "", topicId = ""): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  while (rest.length) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const g = m.groups!;
    if (m[0].startsWith("<flagged")) {
      const a = g.flaggedAttrs ?? "";
      out.push(
        <Flagged
          key={k++}
          correction={getAttr(a, "correction")}
          original={getAttr(a, "original")}
        >
          {renderInline(g.flaggedInner, k + 1000, classId, topicId)}
        </Flagged>,
      );
    } else if (m[0].startsWith("<resolved")) {
      const a = g.resolvedAttrs ?? "";
      out.push(
        <Resolved
          key={k++}
          sources={parseSources(getAttr(a, "sources") ?? "")}
          conflict={getAttr(a, "conflict") ?? ""}
          verdict={getAttr(a, "verdict")}
          classId={classId}
          topicId={topicId}
        >
          {renderInline(g.resolvedInner, k + 1000, classId, topicId)}
        </Resolved>,
      );
    } else if (m[0].startsWith("<math>")) {
      out.push(<MathNode key={k++} tex={g.mathTex} block={false} />);
    } else if (m[0].startsWith("**")) {
      out.push(<strong key={k++}>{g.boldInner}</strong>);
    } else {
      out.push(<q key={k++}>{g.quoteInner}</q>);
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
        {renderWithCite(item.text, item.cite)}
        {item.children.length > 0 && <ul>{renderItems(item.children)}</ul>}
      </li>
    ));
  }

  function cite(srcs: SrcRef[]) {
    if (srcs.length === 0) return null;
    const resolved = srcs.map((src) => ({
      n: reg.getNum(src),
      name: src.name,
      href: sourceHref(src.id, classId, topicId),
    }));
    if (resolved.length === 1) {
      const { n, name, href } = resolved[0];
      return <SourceCite n={n} name={name} href={href} />;
    }
    return <SourceGroup sources={resolved} />;
  }

  function renderWithCite(text: string, srcs: SrcRef[]): React.ReactNode {
    if (srcs.length === 0) return renderInline(text, 0, classId, topicId);
    return (
      <>
        {renderInline(text, 0, classId, topicId)}
        {cite(srcs)}
      </>
    );
  }

  for (const b of blocks) {
    switch (b.kind) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "p": {
        const Tag = b.kind;
        out.push(<Tag key={k++}>{renderWithCite(b.text, b.cite)}</Tag>);
        break;
      }
      case "li-group":
        out.push(<ul key={k++}>{renderItems(b.items)}</ul>);
        break;
      case "conflict":
        out.push(
          <Conflict key={k++} sources={b.sources} verdict={b.verdict} classId={classId} topicId={topicId}>
            {renderInline(b.inner, 0, classId, topicId)}
          </Conflict>,
        );
        break;
      case "math":
        out.push(<MathNode key={k++} tex={b.tex} block />);
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
    const nameById = new Map<string, string>();
    for (const s of allSources ?? []) {
      if (s.id) nameById.set(s.id, s.name);
      reg.getNum(s);
    }
    const blocks = parseBlocks(markdown, nameById);
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
                    <a href={href} className="sf-link">
                      {s.name}
                    </a>
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
