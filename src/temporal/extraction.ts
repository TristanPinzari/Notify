import { db } from "@/server/db";
import { contributions, type EMethod } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getTemporalClient, checkTemporalReady, TASK_QUEUE } from "./client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { extractionWorkflowId } from "@/lib/extraction-config";
import type { ExtractionInput } from "./workflows";

// Not a "use server" action — it takes no session and writes to an
// arbitrary contribution id, so it must never be directly network-reachable.
// Callers (server actions, route handlers) are responsible for auth.

export async function startExtraction(
  id: string,
  extractionMethod: EMethod,
  s3Key?: string,
  url?: string,
): Promise<boolean> {
  const fail = (reason: string) =>
    db
      .update(contributions)
      .set({ status: "failed", failureReason: reason })
      .where(eq(contributions.id, id));

  const health = await checkTemporalReady();
  if (!health.ok) {
    await fail("Extraction service is unavailable. Please try again.");
    return false;
  }

  try {
    const temporalClient = await getTemporalClient();
    const input: ExtractionInput = {
      contributionId: id,
      extractionMethod,
      s3Key,
      url,
    };
    await temporalClient.workflow.start("extractContribution", {
      args: [input],
      taskQueue: TASK_QUEUE,
      workflowId: extractionWorkflowId(id),
    });
    return true;
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) return true;
    console.error(
      `ERROR: failed to queue extraction for contribution ${id}:`,
      e,
    );
    await fail("Failed to queue extraction. Please try again.");
    return false;
  }
}
