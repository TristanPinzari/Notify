"use client";

import { useMemo } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { visit } from "unist-util-visit";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { Element, ElementContent, Root } from "hast";
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
  const results: SrcRef[] = [];
  let lastEnd = 0;
  const re =
    /\|\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = raw
      .slice(lastEnd, m.index)
      .replace(/^[,\s]+/, "")
      .replace(/\s*\|[^|]*$/, "")
      .trim();
    if (name) results.push({ name, id: m[1] });
    lastEnd = m.index + m[0].length;
  }
  return results;
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
      if (!src.id && nameMap.has(src.name)) return nameMap.get(src.name)!;
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

/* ─── sub-components ─────────────────────────────────────────────────── */

function SourceCite({
  n,
  name,
  href,
  staticMode,
}: {
  n: number;
  name: string;
  href?: string;
  staticMode?: boolean;
}) {
  if (staticMode) return <sup className="src-cite-static">[{n}]</sup>;
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
  staticMode,
}: {
  sources: { n: number; name: string; href?: string }[];
  staticMode?: boolean;
}) {
  if (staticMode)
    return (
      <sup className="src-cite-static">
        [{sources.map((s) => s.n).join(", ")}]
      </sup>
    );
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
  staticMode,
}: {
  correction?: string;
  original?: string;
  children: React.ReactNode;
  staticMode?: boolean;
}) {
  if (staticMode)
    return correction && !original ? (
      <>
        {children} <em>({correction})</em>
      </>
    ) : (
      <>{children}</>
    );
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
                <SourceLink
                  href={sourceHref(s.id, classId ?? "", topicId ?? "")}
                  className="cside"
                >
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
          <span className="vci">
            <SparkleIcon size={12} />
          </span>
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
  staticMode,
}: {
  sources: SrcRef[];
  conflict: string;
  verdict?: string;
  children: React.ReactNode;
  classId?: string;
  topicId?: string;
  staticMode?: boolean;
}) {
  if (staticMode) return <>{children}</>;
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
              <SourceLink
                key={i}
                href={sourceHref(s.id, classId ?? "", topicId ?? "")}
                className="rtip-src"
              >
                {s.name}
              </SourceLink>
            ))}
          </span>
        )}
        {verdict && (
          <span className="rtip-verdict">
            <span className="rtip-vci">
              <SparkleIcon size={10} />
            </span>
            {verdict}
          </span>
        )}
      </span>
    </span>
  );
}

/* ─── markdown pre-processing ───────────────────────────────────────── */
//
// Two string-level transforms run before real parsing, each working around
// a real CommonMark rule verified against this app's actual dependencies
// (see the migration plan for the empirical traces). No legacy-syntax
// backward compat — old <math>-tag documents are rare enough (mostly test
// data) that they're not worth carrying a conversion path for.
//
// 1. <flagged>/<resolved>/<conflict> spans have internal newlines collapsed
//    to spaces. A tag that is alone on its own line and spans multiple
//    lines is CommonMark "HTML block type 7", which swallows everything
//    inside — including bold text and bullet lists — as unparsed raw text
//    until the next blank line. Collapsing to one line sidesteps the rule
//    entirely. This matches today's existing behavior for conflict content
//    (already flat, never block-level), so it is not a capability loss.
// 2. <source id="..." name="..." /> has its attributes renamed to
//    srcid/srcname. rehype-sanitize's GitHub-style schema silently
//    rewrites `id`/`name` attribute values with a "user-content-" prefix
//    (anti DOM-clobbering protection) — verified empirically — which would
//    corrupt every citation's id before it ever reaches our own code. The
//    rename is purely internal; the model-facing tag syntax in prompt.ts
//    is unchanged.

function collapseTagNewlines(md: string): string {
  return md.replace(
    /<(flagged|resolved|conflict)(\s[^>]*)?>[\s\S]*?<\/\1>/g,
    (m) => m.replace(/\n/g, " "),
  );
}

function renameSourceAttrs(md: string): string {
  // Matches only well-formed quoted attr="value" pairs (not a bare [^>]*
  // scan) so a contribution title containing a literal `>` — e.g. "Chapter
  // 2 > Review Notes" — doesn't truncate the match and silently drop the
  // rename. Verified empirically: the naive version fails to match at all
  // in that case, leaving id/name unrenamed and the citation lost later to
  // rehype-sanitize's clobber-prefix rewrite.
  return md.replace(
    /<source((?:\s+[a-zA-Z-]+="[^"]*")*)\s*\/>/g,
    (_, attrs = "") => {
      const renamed = attrs
        .replace(/\bid=/g, "srcid=")
        .replace(/\bname=/g, "srcname=");
      return `<source${renamed} />`;
    },
  );
}

function preprocessMarkdown(raw: string): string {
  return renameSourceAttrs(collapseTagNewlines(raw));
}

/* ─── sanitize schema ───────────────────────────────────────────────── */
//
// Extends GitHub's default schema with exactly the 4 custom tags and their
// specific attributes. Everything else (script tags, event handlers,
// javascript: hrefs, arbitrary attributes) is stripped — verified against
// a deliberately hostile payload. This is a required stage, not optional:
// rehype-raw turns raw HTML into real, executing elements, and this
// component's output also feeds Puppeteer server-side for PDF generation.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "flagged",
    "resolved",
    "conflict",
    "source",
  ],
  attributes: {
    ...defaultSchema.attributes,
    flagged: ["correction", "original"],
    resolved: ["sources", "conflict", "verdict"],
    conflict: ["sources", "verdict", "a", "b"],
    source: ["srcid", "srcname"],
  },
};

/* ─── citation plugin ───────────────────────────────────────────────── */
//
// Rehype plugin, run last in the pipeline (on the final, sanitized,
// katex/highlight-resolved tree). Ports the old assignCitations logic:
// walks block-level nodes in document order, strips <source/> children,
// and — for a run of consecutive same-source citations — attaches the
// visible marker only to the LAST node in the run, exactly as before.
//
// Walking both `p` and `li` (direct children only, no recursion) handles
// tight AND loose lists for free: a tight <li> has its <source/> as a
// direct child; a loose <li><p>...</p></li> has it nested one level
// deeper, so the <li>'s own (empty) entry is a harmless no-op and the
// inner <p> picks up the real citation — verified empirically, CommonMark
// guarantees looseness is a whole-list property so there is no mixed case
// to handle. visit()'s default pre-order traversal naturally reproduces
// "document order with nested lists flattened first-then-children", the
// same order the old flattenItem produced by hand.
const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"]);

// <conflict> is the one custom tag that's actually block-level (a <div>),
// not inline like <flagged>/<resolved>. remark decides paragraph-wrapping
// before rehype-raw ever turns the tag into a real element, so a <conflict>
// ends up nested inside a <p> — invalid HTML (a div can't be a p's
// descendant) that causes a real React hydration mismatch in the
// client-rendered view, not just untidy markup. The prompt tells the model
// to always put <conflict> alone on its own line with blank lines around
// it, but that's not guaranteed to be followed — verified empirically that
// without a blank line (or glued directly onto the same line as other
// text), the paragraph still forms with <conflict> as one of several
// children, not the sole one. So rather than only handling the
// "sole child" case, this splits ANY <p> containing a block-level custom
// tag into separate siblings: a <p> for the text before it, the tag itself,
// and a <p> for the text after — correct for the sole-child case too (the
// empty-text siblings are dropped). Runs before rehypeCitations so
// citations attach to the final, correctly-structured tree.
const BLOCK_LEVEL_CUSTOM_TAGS = new Set(["conflict"]);

function isMeaningful(node: ElementContent): boolean {
  return !(node.type === "text" && /^\s*$/.test(node.value));
}

function rehypeUnwrapBlockParagraphs() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index === undefined) return;
      const hasBlockChild = node.children.some(
        (c) => c.type === "element" && BLOCK_LEVEL_CUSTOM_TAGS.has(c.tagName),
      );
      if (!hasBlockChild) return;

      const replacement: ElementContent[] = [];
      let buffer: ElementContent[] = [];
      const flushBuffer = () => {
        if (buffer.some(isMeaningful)) {
          replacement.push({
            type: "element",
            tagName: "p",
            properties: {},
            children: buffer,
          });
        }
        buffer = [];
      };
      for (const child of node.children) {
        if (
          child.type === "element" &&
          BLOCK_LEVEL_CUSTOM_TAGS.has(child.tagName)
        ) {
          flushBuffer();
          replacement.push(child);
        } else {
          buffer.push(child);
        }
      }
      flushBuffer();

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}

function extractSourceChildren(
  children: ElementContent[],
  nameById: Map<string, string>,
): { srcs: SrcRef[]; kept: ElementContent[] } {
  const srcs: SrcRef[] = [];
  const seen = new Set<string>();
  const kept: ElementContent[] = [];
  for (const child of children) {
    if (child.type === "element" && child.tagName === "source") {
      // Removing the tag can leave behind the space that used to separate
      // it from the preceding word — e.g. "states <source/>." would
      // otherwise render as "states ." (dangling space before the
      // period). The citation marker always lands at the very end of the
      // container regardless of where the tag sat (see `attach`), so this
      // trim is purely cosmetic cleanup of the gap the removed tag leaves.
      const prev = kept[kept.length - 1];
      if (prev?.type === "text") {
        prev.value = prev.value.replace(/[ \t]+$/, "");
      }
      const props = child.properties;
      const id = typeof props.srcid === "string" ? props.srcid : undefined;
      const name =
        (typeof props.srcname === "string" ? props.srcname : undefined) ||
        (id ? nameById.get(id) : undefined) ||
        "?";
      const key = id ?? name;
      if (!seen.has(key)) {
        seen.add(key);
        srcs.push({ id, name });
      }
      continue;
    }
    kept.push(child);
  }
  return { srcs, kept };
}

type CitationOptions = {
  classId: string;
  topicId: string;
  allSources?: { id?: string; name: string }[];
  registry: SourceReg;
};

function rehypeCitations(options: CitationOptions) {
  const nameById = new Map<string, string>();
  for (const s of options.allSources ?? []) {
    if (s.id) nameById.set(s.id, s.name);
  }

  function attach(container: Element, srcs: SrcRef[]) {
    if (srcs.length === 1) {
      const { id, name } = srcs[0];
      const n = options.registry.getNum({ id, name });
      const href = sourceHref(id, options.classId, options.topicId);
      container.children.push({
        type: "element",
        tagName: "source-cite",
        properties: { n, name, href: href ?? "" },
        children: [],
      });
    } else {
      const resolved = srcs.map((s) => ({
        n: options.registry.getNum(s),
        name: s.name,
        href: sourceHref(s.id, options.classId, options.topicId) ?? "",
      }));
      container.children.push({
        type: "element",
        tagName: "source-group",
        properties: { sources: JSON.stringify(resolved) },
        children: [],
      });
    }
  }

  return (tree: Root) => {
    type Slot = { container: Element; srcs: SrcRef[] };
    const flat: Slot[] = [];

    visit(tree, "element", (node: Element) => {
      if (!BLOCK_TAGS.has(node.tagName)) return;
      const { srcs, kept } = extractSourceChildren(node.children, nameById);
      node.children = kept;
      flat.push({ container: node, srcs });
    });

    let runSrc: SrcRef | null = null;
    let runContainer: Element | null = null;

    for (const { container, srcs } of flat) {
      if (srcs.length === 0) continue;
      if (srcs.length > 1) {
        if (runContainer && runSrc) attach(runContainer, [runSrc]);
        runSrc = null;
        runContainer = null;
        attach(container, srcs);
        continue;
      }
      const src = srcs[0];
      if (!sameSource(src, runSrc)) {
        if (runContainer && runSrc) attach(runContainer, [runSrc]);
        runSrc = src;
      }
      runContainer = container;
    }
    if (runContainer && runSrc) attach(runContainer, [runSrc]);
  };
}

/* ─── public component ──────────────────────────────────────────────── */

export function CompiledDoc({
  markdown,
  classId,
  topicId,
  allSources,
  staticMode,
}: {
  markdown: string;
  classId: string;
  topicId: string;
  allSources?: { id?: string; name: string }[];
  staticMode?: boolean;
}) {
  const { body, sources } = useMemo(() => {
    const reg = makeRegistry();
    // Seed every known source up front, in allSources order — matches the
    // existing behavior this component has always had (the footer lists
    // every source passed in, not just ones the citation plugin finds).
    for (const s of allSources ?? []) reg.getNum(s);

    const processed = preprocessMarkdown(markdown);
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      // singleDollarTextMath disabled: its default treats any two single `$`
      // in a paragraph as a math span, which mangles ordinary prose dollar
      // amounts (e.g. "$30 and $50" renders as garbled pseudo-math) — verified
      // empirically. Inline math requires $$...$$ on one line instead (see
      // prompt.ts); a lone $ is always just a dollar sign.
      .use(remarkMath, { singleDollarTextMath: false })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeUnwrapBlockParagraphs)
      .use(rehypeKatex)
      .use(rehypeHighlight)
      .use(rehypeCitations, { classId, topicId, allSources, registry: reg });

    const tree = processor.runSync(
      processor.parse(processed),
      processed,
    ) as Root;

    const components = {
      flagged: (props: {
        correction?: string;
        original?: string;
        children?: React.ReactNode;
      }) => (
        <Flagged
          correction={props.correction}
          original={props.original}
          staticMode={staticMode}
        >
          {props.children}
        </Flagged>
      ),
      resolved: (props: {
        sources?: string;
        conflict?: string;
        verdict?: string;
        children?: React.ReactNode;
      }) => (
        <Resolved
          sources={parseSources(props.sources ?? "")}
          conflict={props.conflict ?? ""}
          verdict={props.verdict}
          classId={classId}
          topicId={topicId}
          staticMode={staticMode}
        >
          {props.children}
        </Resolved>
      ),
      conflict: (props: {
        sources?: string;
        verdict?: string;
        a?: string;
        b?: string;
        children?: React.ReactNode;
      }) => {
        const srcs = props.sources
          ? parseSources(props.sources)
          : [props.a, props.b]
              .filter((v): v is string => !!v)
              .map((name) => ({ name }));
        return (
          <Conflict
            sources={srcs}
            verdict={props.verdict}
            classId={classId}
            topicId={topicId}
          >
            {props.children}
          </Conflict>
        );
      },
      "source-cite": (props: { n?: number; name?: string; href?: string }) => (
        <SourceCite
          n={props.n ?? 0}
          name={props.name ?? "?"}
          href={props.href || undefined}
          staticMode={staticMode}
        />
      ),
      "source-group": (props: { sources?: string }) => (
        <SourceGroup
          sources={props.sources ? JSON.parse(props.sources) : []}
          staticMode={staticMode}
        />
      ),
    };

    const body = toJsxRuntime(tree, {
      Fragment,
      jsx,
      jsxs,
      components,
    });

    return { body, sources: reg.list() };
  }, [markdown, classId, topicId, allSources, staticMode]);

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
