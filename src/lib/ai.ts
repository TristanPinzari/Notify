import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";

interface AIProvider {
  generate(prompt: string): Promise<string>;
  countTokens(prompt: string): Promise<number>;
}

export function extractMessage(err: unknown): string {
  if (!(err instanceof Error)) return "An unexpected error occurred.";
  if (err.message.startsWith("{")) {
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.error?.message) return String(parsed.error.message);
    } catch {
      // not valid JSON — fall through
    }
  }
  return err.message;
}

export class Gemini implements AIProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new Error(extractMessage(e));
    }
  }

  async generate(prompt: string): Promise<string> {
    return this.call(async () => {
      const response = await this.client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      if (!response.text) throw new Error("Gemini returned no content.");
      return response.text;
    });
  }

  async countTokens(prompt: string): Promise<number> {
    return this.call(() =>
      this.client.models
        .countTokens({ model: GEMINI_MODEL, contents: prompt })
        .then((r) => r.totalTokens ?? 0),
    );
  }
}
