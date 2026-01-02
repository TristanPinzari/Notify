import { GoogleGenAI } from "@google/genai";
import { extractTextFromPDF } from "./pdf";

const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_KEY});

export async function generateCompiledDoc(collection, bulletFormat, grammarCheck) {
  const text = await generateText(collection, bulletFormat, grammarCheck)
  let innerHTML = ``
  const lines = text.split("\n");

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    if (line.startsWith("- ")) {
      innerHTML += `<ul><li>${line.slice(2).replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")}</li></ul>`;
    } else {
      innerHTML += `<p>${line.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")}</p>`;
    }
  });

  return innerHTML;
}

async function generateText(collection, bulletFormat, grammarCheck) {
  const prompt =`
  You are an AI assistant tasked with merging multiple text documents into a single master document. 

  Your goal:
  1. Include **all unique information** from all documents.
  2. Avoid **any duplicates**, even if the same idea is phrased differently.
  3. Maintain the **original factual details** as much as possible.
  4. Organize the merged content **logically** (group related content together, keep paragraphs intact).

  Instructions:
  - Compare each new paragraph or sentence with the existing master content.
  - Only add information that is **not already present**.
  - Preserve key numbers, names, dates, or other important details exactly as they appear.
  - If multiple phrasings of the same fact exist, choose **the clearest one** or merge them into one sentence.
  - Output the final master document as text only.
  - ${bulletFormat ? "Use headers and bullet points only." : "Use headers and paragraphs only. No bullet points."}
  - ${grammarCheck ? "Correct grammar." : "Do not correct grammar. Keep it as original as possible grammatically"}
  - The first part of your response should be a short one-paragraph maximum broad overview of all the content.
  - Ignore empty documents.
  - Format using line skips "\n", bold using enclosing double astericks "**bolded text**", and bullet points using "- "
  `

  let lastResponse = ""
  const promises = Object.keys(collection).map(key =>
    extractTextFromPDF(collection[key].fileUrl)
  );  
  const texts = await Promise.all(promises);
  for (const text of texts) {
    const secondaryPrompt =prompt + `
    Document 1 text: ${lastResponse}

    Document 2 text: ${text}
    `
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: secondaryPrompt,
    });
    lastResponse = response.text
  }
  return lastResponse
}