import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";

interface AIProvider {
  generate(prompt: string): Promise<string>;
  countTokens(prompt: string): Promise<number>;
}

export class Gemini implements AIProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    if (!response.text) throw new Error("Gemini returned no content.");
    return response.text;
  }

  async countTokens(prompt: string): Promise<number> {
    const response = await this.client.models.countTokens({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return response.totalTokens ?? 0;
  }
}
