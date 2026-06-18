import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";
import { contributions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { YoutubeTranscript } from "youtube-transcript";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import type { ExtractionInput } from "./workflows";
import { Mistral } from "@mistralai/mistralai";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

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

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
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
      const res = await fetch(normalizedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NotifyBot/1.0)" },
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
      const ocrResponse = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: { type: "document_url", documentUrl: signedUrl },
      });
      return { text: ocrResponse.pages.map((p) => p.markdown).join("\n\n") };
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
      const transcriptionResponse = await client.audio.transcriptions.complete({
        model: "voxtral-mini-latest",
        fileUrl: signedUrl,
      });
      return { text: transcriptionResponse.text };
    }

    default:
      throw new Error(`Unknown extraction method: ${extractionMethod}`);
  }
}

export async function extractText(input: ExtractionInput): Promise<void> {
  let res: { title?: string; text: string } = { text: "" };

  try {
    res = await runExtraction(input);
    if (!res.text)
      throw new Error("Extraction succeeded but returned no text.");
  } catch (e) {
    const failureReason = e instanceof Error ? e.message : String(e);
    await db
      .update(contributions)
      .set({
        processingStatus: "failed",
        failureReason,
        ...(res.title ? { name: res.title } : {}),
      })
      .where(eq(contributions.id, input.contributionId));
    throw e;
  }

  await db
    .update(contributions)
    .set({
      text: res.text,
      processingStatus: "ready",
      ...(res.title ? { name: res.title } : {}),
    })
    .where(eq(contributions.id, input.contributionId));
}

export async function cleanOrphanedFiles() {
  const rows = await db
    .select({ s3Key: contributions.s3Key })
    .from(contributions);
  const keySet = new Set(rows.map((r) => r.s3Key));

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
      if (!obj.Key.startsWith("contributions/")) continue;
      if (keySet.has(obj.Key)) continue;
      if (now - (obj.LastModified?.getTime() ?? now) > GRACE_MS)
        orphans.push(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  if (orphans.length === 0) return;

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Delete: { Objects: orphans.map((key) => ({ Key: key })) },
    }),
  );
}

export type Activities = {
  extractText: typeof extractText;
  cleanOrphanedFiles: typeof cleanOrphanedFiles;
};
