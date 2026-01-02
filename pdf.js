import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPDF(url) {
  const pdf = await pdfjsLib.getDocument(url).promise;

  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }

  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

// extractTextFromPDF("https://nyc.cloud.appwrite.io/v1/storage/buckets/68e2ea3f002ef65184ad/files/68ff86520024ad3a0b74/download?project=68e2e9ff001d7ee187b1").then(text => {
// 	console.log(text)
// })

