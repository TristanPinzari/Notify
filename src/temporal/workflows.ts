import { proxyActivities } from "@temporalio/workflow";
import type { Activities } from "./activities";

const { extractText } = proxyActivities<Activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "5s",
    backoffCoefficient: 2,
  },
});

const { cleanOrphanedFiles } = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 1 },
});

export interface ExtractionInput {
  contributionId: string;
  extractionMethod: string;
  s3Key?: string;
  url?: string;
}

export async function extractContribution(
  input: ExtractionInput,
): Promise<void> {
  await extractText(input);
}

export async function reconcileStorage(): Promise<void> {
  await cleanOrphanedFiles();
}
