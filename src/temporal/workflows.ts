import { proxyActivities } from "@temporalio/workflow";
import { type Activities } from "./activities";
import { CompilationSettings } from "@/server/actions/master-documents";

const { extractText } = proxyActivities<Activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "5s",
    backoffCoefficient: 2,
  },
});

const { runCompilation, generatePDF } = proxyActivities<Activities>({
  startToCloseTimeout: "30 minutes",
  retry: { maximumAttempts: 1 },
});

const {
  cleanOrphanedFiles,
  cleanStuckContributions,
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
  await extractText(input);
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
}

export async function reconcileMasterDocuments(): Promise<void> {
  await cleanStuckMasterDocuments();
}

export async function purgeOldLogs(): Promise<void> {
  await cleanOldLogs();
}
