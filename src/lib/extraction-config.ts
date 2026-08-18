export const EXTRACTION_MAX_ATTEMPTS = 3;
export const EXTRACTION_ATTEMPT_TIMEOUT_MIN = 90;
export const AUDIO_CHUNK_MIN = 50;
export const AUDIO_CHUNK_CONCURRENCY = 4;

export function extractionWorkflowId(contributionId: string): string {
  return `extract-${contributionId}`;
}
