import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";
import { contributions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { YoutubeTranscript } from "youtube-transcript";
import { PDFParse } from "pdf-parse";
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

async function runExtraction(input: ExtractionInput): Promise<string> {
  const { extractionMethod, s3Key, url } = input;

  switch (extractionMethod) {
    case "text_extraction": {
      if (!s3Key) throw new Error("s3Key required for text_extraction.");
      const buf = await fetchS3Buffer(s3Key);
      if (s3Key.endsWith(".pdf")) {
        const parser = new PDFParse({ data: buf });
        const result = await parser.getText();
        return result.text;
      }
      return buf.toString("utf-8");
    }

    case "youtube_transcript": {
      if (!url) throw new Error("url required for youtube_transcript.");
      const videoId = extractVideoId(url);
      if (!videoId) throw new Error("Could not extract video ID from URL.");
      const segments = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: "en",
      });
      return segments.map((s) => s.text).join(" ");
    }

    case "web_scrape": {
      if (!url) throw new Error("url required for web_scrape.");
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NotifyBot/1.0)" },
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const html = await res.text();
      // Strip tags and collapse whitespace
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text;
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
      return ocrResponse.pages.map((p) => p.markdown).join("\n\n");
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
      return transcriptionResponse.text;
    }

    default:
      throw new Error(`Unknown extraction method: ${extractionMethod}`);
  }
}

export async function extractText(input: ExtractionInput): Promise<void> {
  let text: string;

  try {
    text = await runExtraction(input);
    if (!text) throw new Error("Extraction succeeded but returned no text.");
  } catch (e) {
    const failureReason = e instanceof Error ? e.message : String(e);
    await db
      .update(contributions)
      .set({ processingStatus: "failed", failureReason })
      .where(eq(contributions.id, input.contributionId));
    throw e;
  }

  await db
    .update(contributions)
    .set({ text, processingStatus: "ready" })
    .where(eq(contributions.id, input.contributionId));
}

export type Activities = {
  extractText: typeof extractText;
};
