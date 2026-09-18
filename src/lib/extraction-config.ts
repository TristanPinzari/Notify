export const EXTRACTION_MAX_ATTEMPTS = 3;
export const EXTRACTION_ATTEMPT_TIMEOUT_MIN = 90;
export const AUDIO_CHUNK_MIN = 150;
export const AUDIO_CHUNK_CONCURRENCY = 4;
export const AUDIO_CHUNK_REQUEST_GAP_MS = 2000;

export function extractionWorkflowId(contributionId: string): string {
  return `extract-${contributionId}`;
}
