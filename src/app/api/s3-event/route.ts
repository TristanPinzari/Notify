import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { contributions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { startExtraction } from "@/temporal/extraction";

const SNS_SUBSCRIBE_URL_RE = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//;

export async function POST(req: NextRequest) {
  const messageType = req.headers.get("x-amz-sns-message-type");
  const body = await req.json();

  if (messageType === "SubscriptionConfirmation") {
    const subscribeUrl = body.SubscribeURL;
    if (
      typeof subscribeUrl === "string" &&
      SNS_SUBSCRIBE_URL_RE.test(subscribeUrl)
    ) {
      await fetch(subscribeUrl);
    } else {
      console.error("[s3-event] Rejected SubscribeURL:", subscribeUrl);
    }
    return Response.json({ ok: true });
  }

  if (messageType !== "Notification") {
    return Response.json({ ok: true });
  }

  let records: Array<{ s3: { object: { key: string } } }>;
  try {
    const message = JSON.parse(body.Message as string);
    records = message.Records ?? [];
  } catch {
    return Response.json({ ok: true });
  }

  for (const record of records) {
    const rawKey = record.s3?.object?.key;
    if (!rawKey) continue;
    const s3Key = decodeURIComponent(rawKey.replace(/\+/g, " "));

    const [contribution] = await db
      .select()
      .from(contributions)
      .where(eq(contributions.s3Key, s3Key))
      .limit(1);

    if (!contribution || contribution.status !== "processing") continue;

    await startExtraction(
      contribution.id,
      contribution.extractionMethod,
      contribution.s3Key ?? undefined,
      contribution.url ?? undefined,
    );
  }

  return Response.json({ ok: true });
}
