import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";
import {
  contributions,
  compilationSources,
  masterDocuments,
  topics,
  user,
  activityLogs,
} from "@/server/db/schema";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { logActivity } from "@/lib/activity-log";
import { YoutubeTranscript } from "youtube-transcript";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import type { ExtractionInput } from "./workflows";
import { Mistral } from "@mistralai/mistralai";
import { CompilationSettings } from "@/server/actions/master-documents";
import { Gemini } from "@/lib/ai";
import { buildPrompt } from "@/lib/prompt";
import { extractVideoId } from "@/lib/youtube";
import puppeteer from "puppeteer";
import { CompiledDoc } from "@/components/doc-render";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

function sanitizeAiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/high demand|overloaded|rate.?limit|429|too many requests|capacity|try again later/i.test(msg))
    return "AI service is busy. Please try again shortly.";
  if (/quota|billing|payment|insufficient/i.test(msg))
    return "AI service quota exceeded. Please contact support.";
  if (/invalid.?key|unauthorized|403|authentication/i.test(msg))
    return "AI service configuration error. Please contact support.";
  return msg;
}

async function fetchS3Buffer(s3Key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: s3Key }),
  );
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function runExtraction(
  input: ExtractionInput,
): Promise<{ title?: string; text: string }> {
  const { extractionMethod, s3Key, url } = input;

  switch (extractionMethod) {
    case "text_extraction": {
      if (!s3Key) throw new Error("s3Key required for text_extraction.");
      const buf = await fetchS3Buffer(s3Key);
      if (s3Key.endsWith(".pdf")) {
        const parser = new PDFParse({ data: buf });
        const result = await parser.getText();
        return { text: result.text };
      }
      if (s3Key.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer: buf });
        return { text: result.value };
      }
      return { text: buf.toString("utf-8") };
    }

    case "youtube_transcript": {
      if (!url) throw new Error("url required for youtube_transcript.");
      const videoId = extractVideoId(url);
      if (!videoId) throw new Error("Could not extract video ID from URL.");
      const segments = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: "en",
      });
      return { text: segments.map((s) => s.text).join(" ") };
    }

    case "web_scrape": {
      if (!url) throw new Error("url required for web_scrape.");
      const normalizedUrl = url.trim().match(/^https?:\/\//)
        ? url.trim()
        : `https://${url.trim()}`;

      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error("Only http and https URLs are allowed.");
      const hostname = parsed.hostname;
      const privateRanges =
        /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fc00:|fe80:)/i;
      if (privateRanges.test(hostname))
        throw new Error(
          "Requests to private/internal addresses are not allowed.",
        );

      const res = await fetch(normalizedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NotifyBot/1.0)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const html = await res.text();
      if (
        /access denied|you don't have permission|blocked|captcha|cloudflare|enable javascript/i.test(
          html.slice(0, 2000),
        )
      )
        throw new Error("This site is bot-protected and cannot be scraped.");
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { title, text };
    }

    case "handwriting_ocr": {
      if (!s3Key) throw new Error("s3Key required for handwriting_ocr.");
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
        }),
        { expiresIn: 300 },
      );
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      try {
        const ocrResponse = await client.ocr.process({
          model: "mistral-ocr-latest",
          document: { type: "document_url", documentUrl: signedUrl },
        });
        return { text: ocrResponse.pages.map((p) => p.markdown).join("\n\n") };
      } catch (e) {
        throw new Error(sanitizeAiError(e));
      }
    }

    case "speech_to_text": {
      if (!s3Key) throw new Error("s3Key required for speech_to_text.");
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
        }),
        { expiresIn: 300 },
      );
      const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      try {
        const transcriptionResponse = await client.audio.transcriptions.complete({
          model: "voxtral-mini-latest",
          fileUrl: signedUrl,
        });
        return { text: transcriptionResponse.text };
      } catch (e) {
        throw new Error(sanitizeAiError(e));
      }
    }

    default:
      throw new Error(`Unknown extraction method: ${extractionMethod}`);
  }
}

export async function extractText(input: ExtractionInput): Promise<void> {
  console.log(
    `[extractText] start — contribution ${input.contributionId} method=${input.extractionMethod}`,
  );
  let res: { title?: string; text: string } = { text: "" };

  try {
    res = await runExtraction(input);
    if (!res.text)
      throw new Error("Extraction succeeded but returned no text.");
  } catch (e) {
    const failureReason = e instanceof Error ? e.message : String(e);
    console.error(
      `[extractText] failed — contribution ${input.contributionId}: ${failureReason}`,
    );
    await db
      .update(contributions)
      .set({
        status: "failed",
        failureReason,
        ...(res.title ? { name: res.title } : {}),
      })
      .where(eq(contributions.id, input.contributionId));
    throw e;
  }

  console.log(
    `[extractText] done — contribution ${input.contributionId} (${res.text.length} chars)`,
  );
  await db
    .update(contributions)
    .set({
      text: res.text,
      status: "ready",
      ...(res.title ? { name: res.title } : {}),
    })
    .where(eq(contributions.id, input.contributionId));
}

export async function runCompilation(
  masterDocumentId: string,
  topicId: string,
  settings: CompilationSettings,
): Promise<void> {
  console.log(
    `[runCompilation] start — masterDocument ${masterDocumentId} topic=${topicId}`,
  );

  const [docMeta] = await db
    .select({
      classId: topics.classId,
      triggeredBy: masterDocuments.triggeredBy,
    })
    .from(masterDocuments)
    .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
    .where(eq(masterDocuments.id, masterDocumentId))
    .limit(1);

  try {
    const rows = await db
      .select({
        id: contributions.id,
        name: contributions.name,
        text: contributions.text,
        uploaderName: user.name,
        pinned: contributions.pinned,
        type: contributions.type,
        uploadedBy: contributions.uploadedBy,
      })
      .from(contributions)
      .leftJoin(user, eq(user.id, contributions.uploadedBy))
      .where(
        and(
          eq(contributions.topicId, topicId),
          eq(contributions.status, "ready"),
        ),
      )
      .orderBy(desc(contributions.pinned));

    const forPrompt = rows
      .filter((r) => r.text !== null)
      .map((r) => ({
        ...r,
        text: r.text!,
        uploaderName: r.uploaderName ?? "Deleted user",
      }));

    if (forPrompt.length === 0) {
      console.error(
        `[runCompilation] no contributions to compile — masterDocument ${masterDocumentId}`,
      );
      await db
        .update(masterDocuments)
        .set({
          status: "failed",
          content: null,
          failureReason: "Nothing to compile.",
        })
        .where(eq(masterDocuments.id, masterDocumentId));
      return;
    }

    console.log(
      `[runCompilation] ${forPrompt.length} contributions loaded, counting tokens…`,
    );
    const ai = new Gemini(process.env.GEMINI_API_KEY!);

    // Fetch the previous ready document for incremental merging (not from scratch)
    let existingDocument: string | undefined;
    let prevDocId: string | undefined;
    if (!settings.fromScratch) {
      const [prev] = await db
        .select({ id: masterDocuments.id, content: masterDocuments.content })
        .from(masterDocuments)
        .where(
          and(
            eq(masterDocuments.topicId, topicId),
            eq(masterDocuments.status, "ready"),
          ),
        )
        .orderBy(desc(masterDocuments.createdAt))
        .limit(1);
      if (prev?.content) {
        existingDocument = prev.content;
        prevDocId = prev.id;
        console.log(
          `[runCompilation] incremental mode — existing doc is ${existingDocument.length} chars`,
        );
      }
    }

    const fullPrompt = buildPrompt(
      forPrompt,
      settings,
      "",
      true,
      existingDocument,
    );
    const totalTokens = await ai.countTokens(fullPrompt);
    console.log(
      `[runCompilation] token count: ${totalTokens.toLocaleString()}`,
    );

    let content: string;

    try {
      if (totalTokens <= 800_000) {
        console.log(`[runCompilation] single-pass generation…`);
        content = await ai.generate(fullPrompt);
      } else if (totalTokens <= 1_600_000) {
        console.log(`[runCompilation] two-pass generation (pass 1/2)…`);
        const half = Math.ceil(forPrompt.length / 2);
        const firstPrompt = buildPrompt(
          forPrompt.slice(0, half),
          settings,
          "",
          false,
          existingDocument,
        );
        const contextBlock = await ai.generate(firstPrompt);
        console.log(`[runCompilation] two-pass generation (pass 2/2)…`);
        const secondPrompt = buildPrompt(
          forPrompt.slice(half),
          settings,
          contextBlock,
          true,
          existingDocument,
        );
        content = await ai.generate(secondPrompt);
      } else {
        throw new Error(
          "Topic has too many contributions to compile. Try removing some contributions or splitting into multiple topics.",
        );
      }
    } catch (e) {
      throw new Error(sanitizeAiError(e));
    }

    console.log(
      `[runCompilation] generation done (${content.length} chars), saving…`,
    );

    const newContribIds = new Set(rows.map((r) => r.id));
    const prevSources = prevDocId
      ? await db
          .select()
          .from(compilationSources)
          .where(eq(compilationSources.masterDocumentId, prevDocId))
      : [];
    const inheritedSources = prevSources.filter(
      (s) => s.contributionId === null || !newContribIds.has(s.contributionId),
    );

    await db.transaction(async (tx) => {
      await tx
        .update(masterDocuments)
        .set({ content, status: "ready" })
        .where(eq(masterDocuments.id, masterDocumentId));

      await tx
        .delete(compilationSources)
        .where(eq(compilationSources.masterDocumentId, masterDocumentId));

      await tx.insert(compilationSources).values([
        ...rows.map((r) => ({
          id: crypto.randomUUID(),
          masterDocumentId,
          contributionId: r.id,
          snapshotName: r.name,
          snapshotType: r.type,
          snapshotUploadedBy: r.uploadedBy,
          snapshotUploaderName: r.uploaderName,
        })),
        ...inheritedSources.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          masterDocumentId,
        })),
      ]);

      const oldDocs = await tx
        .select({ id: masterDocuments.id })
        .from(masterDocuments)
        .where(
          and(
            eq(masterDocuments.topicId, topicId),
            eq(masterDocuments.status, "ready"),
          ),
        )
        .orderBy(desc(masterDocuments.createdAt))
        .offset(5);
      if (oldDocs.length > 0)
        await tx.delete(masterDocuments).where(
          inArray(
            masterDocuments.id,
            oldDocs.map((d) => d.id),
          ),
        );

      await tx
        .update(contributions)
        .set({ status: "compiled" })
        .where(
          and(
            eq(contributions.topicId, topicId),
            eq(contributions.status, "ready"),
          ),
        );
    });

    console.log(
      `[runCompilation] complete — masterDocument ${masterDocumentId}`,
    );
    if (docMeta) {
      logActivity(
        docMeta.classId,
        docMeta.triggeredBy,
        { action: "compilation_completed" },
        topicId,
      );
    }
  } catch (e) {
    const failureReason = e instanceof Error ? e.message : String(e);
    console.error(
      `[runCompilation] failed — masterDocument ${masterDocumentId}: ${failureReason}`,
    );
    await db
      .update(masterDocuments)
      .set({ status: "failed", content: null, failureReason })
      .where(eq(masterDocuments.id, masterDocumentId));
    if (docMeta) {
      logActivity(
        docMeta.classId,
        docMeta.triggeredBy,
        { action: "compilation_failed" },
        topicId,
      );
    }
    throw e;
  }
}

export async function generatePDF(
  classId: string,
  topicId: string,
  masterDocumentId: string,
) {
  console.log(`[generatePDF] start — masterDocument ${masterDocumentId}`);
  try {
    const [doc] = await db
      .select({ content: masterDocuments.content })
      .from(masterDocuments)
      .where(eq(masterDocuments.id, masterDocumentId))
      .limit(1);
    if (!doc) throw new Error("Master document does not exist.");
    if (!doc.content) throw new Error("Master document has no content.");

    const sourceRows = await db
      .select({
        contributionId: compilationSources.contributionId,
        contributionName: contributions.name,
        snapshotName: compilationSources.snapshotName,
      })
      .from(compilationSources)
      .leftJoin(
        contributions,
        eq(compilationSources.contributionId, contributions.id),
      )
      .where(eq(compilationSources.masterDocumentId, masterDocumentId));

    const allSources = sourceRows.map((r) => ({
      id: r.contributionId ?? undefined,
      name: r.contributionName ?? r.snapshotName ?? "Unknown",
    }));

    const css =
      fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8") +
      fs.readFileSync(
        path.join(process.cwd(), "node_modules/katex/dist/katex.min.css"),
        "utf-8",
      );
    const body = renderToStaticMarkup(
      React.createElement(CompiledDoc, {
        markdown: doc.content,
        classId,
        topicId,
        allSources,
        staticMode: true,
      }),
    );
    const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8" /><base href="${baseUrl}" /><style>${css}@page{margin:20mm 18mm;background-color:#f4efe4}html,body{background:var(--paper)}</style></head><body>${body}</body></html>`;

    const browser = await puppeteer.launch({ headless: "shell" });
    let pdf: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: "load" });
      pdf = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
        }),
      );
    } finally {
      await browser.close();
    }

    const s3Key = `pdfs/${masterDocumentId}.pdf`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        Body: pdf,
        ContentType: "application/pdf",
      }),
    );

    await db
      .update(masterDocuments)
      .set({ pdfStatus: "ready", pdfS3Key: s3Key })
      .where(eq(masterDocuments.id, masterDocumentId));

    console.log(`[generatePDF] complete — masterDocument ${masterDocumentId}`);
  } catch (e) {
    await db
      .update(masterDocuments)
      .set({ pdfStatus: "failed" })
      .where(eq(masterDocuments.id, masterDocumentId));
    throw e;
  }
}

export async function cleanOldLogs() {
  console.log(`[cleanOldLogs] start`);
  const cutoff = new Date(Date.now() - 4 * 30 * 24 * 60 * 60 * 1000);
  await db.delete(activityLogs).where(lt(activityLogs.createdAt, cutoff));
  console.log(`[cleanOldLogs] done`);
}

export async function cleanOrphanedFiles() {
  console.log(`[cleanOrphanedFiles] start`);

  const contribRows = await db
    .select({ s3Key: contributions.s3Key })
    .from(contributions);
  const contribKeySet = new Set(contribRows.map((r) => r.s3Key));

  const pdfRows = await db
    .select({ pdfS3Key: masterDocuments.pdfS3Key })
    .from(masterDocuments);
  const pdfKeySet = new Set(pdfRows.map((r) => r.pdfS3Key).filter(Boolean));

  const GRACE_MS = 10 * 60 * 1000;
  const now = Date.now();
  const orphans: string[] = [];

  let continuationToken: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.AWS_S3_BUCKET!,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      if (now - (obj.LastModified?.getTime() ?? now) <= GRACE_MS) continue;
      if (obj.Key.startsWith("contributions/") && !contribKeySet.has(obj.Key))
        orphans.push(obj.Key);
      else if (obj.Key.startsWith("pdfs/") && !pdfKeySet.has(obj.Key))
        orphans.push(obj.Key);
    }
    continuationToken =
      res.IsTruncated && res.NextContinuationToken
        ? res.NextContinuationToken
        : undefined;
  } while (continuationToken);

  if (orphans.length === 0) {
    console.log(`[cleanOrphanedFiles] nothing to delete`);
    return;
  }

  console.log(`[cleanOrphanedFiles] deleting ${orphans.length} orphan(s)…`);
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Delete: { Objects: orphans.map((key) => ({ Key: key })) },
    }),
  );
  console.log(`[cleanOrphanedFiles] done`);
}

export async function cleanStuckContributions() {
  console.log(`[cleanStuckContributions] start`);
  const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  await db
    .update(contributions)
    .set({
      status: "failed",
      failureReason: "Processing timed out — worker may have crashed.",
    })
    .where(
      and(
        eq(contributions.status, "processing"),
        lt(contributions.createdAt, cutoff),
      ),
    );
  console.log(`[cleanStuckContributions] done`);
}

export async function cleanStuckMasterDocuments() {
  console.log(`[cleanStuckMasterDocuments] start`);

  const compileCutoff = new Date(Date.now() - 15 * 60 * 1000);
  await db
    .update(masterDocuments)
    .set({
      status: "failed",
      failureReason: "Compilation timed out — worker may have crashed.",
    })
    .where(
      and(
        eq(masterDocuments.status, "compiling"),
        lt(masterDocuments.createdAt, compileCutoff),
      ),
    );

  const pdfCutoff = new Date(Date.now() - 10 * 60 * 1000);
  await db
    .update(masterDocuments)
    .set({ pdfStatus: "failed" })
    .where(
      and(
        eq(masterDocuments.pdfStatus, "generating"),
        lt(masterDocuments.pdfGenerationStartedAt, pdfCutoff),
      ),
    );

  console.log(`[cleanStuckMasterDocuments] done`);
}

export type Activities = {
  extractText: typeof extractText;
  runCompilation: typeof runCompilation;
  generatePDF: typeof generatePDF;
  cleanOrphanedFiles: typeof cleanOrphanedFiles;
  cleanStuckContributions: typeof cleanStuckContributions;
  cleanStuckMasterDocuments: typeof cleanStuckMasterDocuments;
  cleanOldLogs: typeof cleanOldLogs;
};
