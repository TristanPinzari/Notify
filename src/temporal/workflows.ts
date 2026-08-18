import { proxyActivities } from "@temporalio/workflow";
import { ActivityFailure, ApplicationFailure } from "@temporalio/common";
import { type Activities } from "./activities";
import type { CompilationSettings } from "@/server/actions/master-documents";
import {
  EXTRACTION_MAX_ATTEMPTS,
  EXTRACTION_ATTEMPT_TIMEOUT_MIN,
} from "../lib/extraction-config";

const { extractText } = proxyActivities<Activities>({
  startToCloseTimeout: `${EXTRACTION_ATTEMPT_TIMEOUT_MIN} minutes`,
  retry: {
    maximumAttempts: EXTRACTION_MAX_ATTEMPTS,
    initialInterval: "5s",
    backoffCoefficient: 2,
  },
});

const { markExtractionFailed } = proxyActivities<Activities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 5, initialInterval: "2s", backoffCoefficient: 2 },
});

const { runCompilation, generatePDF } = proxyActivities<Activities>({
  startToCloseTimeout: "30 minutes",
  retry: { maximumAttempts: 1 },
});

const {
  cleanOrphanedFiles,
  cleanOrphanedClasses,
  cleanStuckContributions,
  cleanFailedUploads,
  cleanStuckMasterDocuments,
  cleanOldLogs,
} = proxyActivities<Activities>({
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
  try {
    await extractText(input);
  } catch (e) {
    const inner = e instanceof ActivityFailure ? e.cause : e;
    const reason =
      inner instanceof ApplicationFailure || inner instanceof Error
        ? inner.message
        : String(inner);
    const title =
      inner instanceof ApplicationFailure
        ? (inner.details?.[0] as string | undefined)
        : undefined;
    await markExtractionFailed(input.contributionId, reason, title);
  }
}

export async function compileContributions(
  masterDocumentId: string,
  topicId: string,
  settings: CompilationSettings,
): Promise<void> {
  await runCompilation(masterDocumentId, topicId, settings);
}

export async function runPDFGeneration(
  classId: string,
  topicId: string,
  masterDocumentId: string,
) {
  await generatePDF(classId, topicId, masterDocumentId);
}

export async function reconcileStorage(): Promise<void> {
  await cleanOrphanedFiles();
}

export async function reconcileDatabase(): Promise<void> {
  await cleanStuckContributions();
  await cleanFailedUploads();
}

export async function reconcileMasterDocuments(): Promise<void> {
  await cleanStuckMasterDocuments();
}

export async function purgeOldLogs(): Promise<void> {
  await cleanOldLogs();
}

export async function purgeOrphanedClasses(): Promise<void> {
  await cleanOrphanedClasses();
}
