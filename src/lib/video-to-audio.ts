import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { extOf } from "@/lib/utils";

// Self-hosted (public/ffmpeg/) rather than fetched from a CDN at runtime,
// so this doesn't depend on a third-party host being up for a core feature.
const CORE_BASE = "/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;

function loadFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

// All calls share one FFmpeg instance (and its progress-event listeners
// aren't scoped per call), so running two conversions at once would let
// their virtual-filesystem writes and progress callbacks clobber each
// other. This queue serializes calls onto that shared instance instead.
let queue: Promise<void> = Promise.resolve();

// Extracts the audio track from a video file entirely in-browser (ffmpeg.wasm)
// and returns it as a standalone MP3 File — used so a video never has to be
// uploaded/stored just to get at the audio the extraction pipeline actually
// needs.
export function extractAudioFromVideo(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const run = queue.then(() => runExtraction(file, onProgress));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runExtraction(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const ffmpeg = await loadFFmpeg();
  const inExt = extOf(file) || "mp4";
  const inputName = `input.${inExt}`;
  const outputName = "output.mp3";

  const onProgressEvent = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  if (onProgress) ffmpeg.on("progress", onProgressEvent);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    const code = await ffmpeg.exec([
      "-i",
      inputName,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ab",
      "128k",
      outputName,
    ]);
    if (code !== 0) throw new Error("Audio extraction failed.");

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([(data as Uint8Array).slice()], {
      type: "audio/mpeg",
    });
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.mp3`, { type: "audio/mpeg" });
  } finally {
    if (onProgress) ffmpeg.off("progress", onProgressEvent);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
