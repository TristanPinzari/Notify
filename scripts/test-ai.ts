import { Gemini } from "../src/lib/ai";

const ai = new Gemini(process.env.GEMINI_API_KEY!);

async function main() {
  const tokens = await ai.countTokens("Hello, world!");
  console.log("Tokens:", tokens);

  const result = await ai.generate("Which is the best Gemini model?");
  console.log("Response:", result);
}

main();
