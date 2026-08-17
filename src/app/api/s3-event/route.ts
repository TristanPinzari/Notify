import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { contributions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  getTemporalClient,
  checkTemporalReady,
  TASK_QUEUE,
} from "@/temporal/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import type { ExtractionInput } from "@/temporal/workflows";

export async function POST(req: NextRequest) {
  const messageType = req.headers.get("x-amz-sns-message-type");
  const body = await req.json();

  if (messageType === "SubscriptionConfirmation") {
    await fetch(body.SubscribeURL as string);
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

    const health = await checkTemporalReady();
    if (!health.ok) {
      console.error(
        `[s3-event] Temporal not ready for contribution ${contribution.id}`,
      );
      continue;
    }

    try {
      const temporalClient = await getTemporalClient();
      const input: ExtractionInput = {
        contributionId: contribution.id,
        extractionMethod: contribution.extractionMethod,
        s3Key: contribution.s3Key ?? undefined,
        url: contribution.url ?? undefined,
      };
      await temporalClient.workflow.start("extractContribution", {
        args: [input],
        taskQueue: TASK_QUEUE,
        workflowId: `extract-${contribution.id}`,
      });
    } catch (e) {
      if (e instanceof WorkflowExecutionAlreadyStartedError) continue;
      console.error(
        `[s3-event] Failed to queue extraction for ${contribution.id}:`,
        e,
      );
    }
  }

  return Response.json({ ok: true });
}
