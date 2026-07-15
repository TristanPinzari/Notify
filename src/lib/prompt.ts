import type { CompilationSettings } from "@/server/actions/master-documents";

export type ContributionForPrompt = {
  id: string;
  name: string;
  text: string;
  uploaderName: string;
  pinned: boolean;
};

const OUTPUT_TYPE = {
  prose: "Write in flowing prose paragraphs.",
  bullet: "Use bullet points and lists throughout.",
  both: "Use prose for explanations and bullet points for lists, steps, and enumerations — whichever fits best.",
};

const DEPTH = {
  concise: "Be concise — capture the essential points without elaboration.",
  standard:
    "Strike a balance — cover the material thoroughly but avoid padding.",
  detailed:
    "Be comprehensive — include examples, elaborations, and supporting detail from the sources.",
};

const CONFLICT_RESOLUTION = {
  trust_pinned:
    "When contributions state different facts, trust the pinned contribution's version and write it as fact — do not use <conflict>. If no pinned contribution covers the disputed fact, go with the majority; if sources are still split with no majority, use <conflict> with a verdict. Only use <conflict> when pinned contributions themselves disagree with each other — always include a verdict attribute with your judgment of which is most likely correct and briefly why.",
  trust_majority:
    "When contributions state different facts, go with the majority version and write it as fact — do not use <conflict>. Only use <conflict> when no single version has majority support — including three-way splits where all sources differ — always include a verdict attribute with your judgment of which is most likely correct and briefly why.",
  flag_all:
    "Whenever contributions state different facts about the same thing, use <conflict>. Always include a verdict attribute — state which source is most likely correct and briefly why, or write \"Neither — [your answer]\" if none of the sources are right.",
  replace_flag:
    "Whenever contributions state different facts about the same thing, write the correct answer as normal prose — do NOT use <conflict>. Instead, wrap just the resolved fact in <resolved sources=\"Name A, Name B\" conflict=\"A says X, B says Y\" verdict=\"brief reason for your choice\">your answer</resolved>. Choose the most accurate answer regardless of which source said it. If none are right, use your own knowledge and set verdict to \"Neither source was right — [brief explanation]\".",
};

const FACT_CHECK = {
  none: "Do not fact-check or alter any claims — reproduce what the sources say.",
  flag: 'If a claim seems factually dubious, wrap it in <flagged correction="your suggested correction">paraphrased original claim</flagged> — paraphrase what the source said inside the tags and put the correct version in the correction attribute.',
  replace:
    'If a claim is clearly factually incorrect, write the correction inside <flagged original="paraphrased original claim">correction</flagged> — put your correction inside the tags and a clean paraphrase of what the source said in the original attribute. Never quote verbatim, especially transcribed speech.',
};

const CONFLICT_TAG = `- <conflict sources="Name A|CONTRIBUTION_ID_A, Name B|CONTRIBUTION_ID_B" verdict="AI judgment">Source A says X. Source B says Y.</conflict>
  Use when uploaded student contributions state different facts about the same thing — e.g. one says a date is 1776 and another says 1778. The sources attribute is a comma-separated list of "Name|ID" pairs using the contribution name and ID from the header above each contribution (e.g. "Alice's Notes|abc123, Bob's Notes|def456"). Three or more sources may be listed when they all disagree. The verdict attribute is required: state which source is most likely correct and briefly why, or write "Neither — [your answer]" if none are right. Do NOT use <conflict> for differences of opinion, philosophical disagreement, or academic debate — those belong in prose. CRITICAL: sources must list only real uploaded contribution names and IDs — never use placeholders like "Unknown" or any name not matching an actual contribution. If only one source makes a claim, use <flagged> instead. IMPORTANT: <conflict> must appear on its own dedicated line with a blank line before and after it — never appended to a sentence, never on the same line as any other text. The line must contain nothing except the opening tag, its content, and the closing tag.`;

const RESOLVED_TAG = `- <resolved sources="Name A|CONTRIBUTION_ID_A, Name B|CONTRIBUTION_ID_B" conflict="brief summary of the disagreement" verdict="brief reason for the chosen answer">AI's chosen answer</resolved>
  Use ONLY under the Replace & Flag conflict mode. Write your best answer as the tag content — that is what readers see. The sources attribute is a comma-separated list of "Name|ID" pairs using the contribution name and ID from the header above each contribution (e.g. "Alice's Notes|abc123, Bob's Notes|def456"). The conflict attribute briefly summarises what they disagreed on (e.g. "A says 1776, B says 1778"). The verdict attribute explains why you chose this answer (e.g. "Source A is corroborated by standard references") or states "Neither source was right — [reason]" if you used your own knowledge. Include any trailing sentence punctuation (period, comma, etc.) inside the tag before </resolved>. Do NOT use this tag in any other conflict mode.`;

const FLAGGED_TAG_FLAG = `- <flagged correction="AI suggested correction">paraphrased original claim</flagged>
  Use when a source makes a dubious claim — paraphrase the original claim cleanly inside the tags and put your suggested correction in the correction attribute. The original is shown to the reader; the correction appears on hover. Include any trailing sentence punctuation (period, comma, etc.) inside the tag before </flagged>.`;

const FLAGGED_TAG_REPLACE = `- <flagged original="paraphrased original claim">correction</flagged>
  Use when a claim is clearly wrong — write your correction inside the tags and put a clean paraphrase of what the source said in the original attribute. The correction is shown to the reader; the original appears on hover. Never quote verbatim, especially transcribed speech. Include any trailing sentence punctuation (period, comma, etc.) inside the tag before </flagged>.`;

const SOURCE_TAG = `- <source id="CONTRIBUTION_ID" name="CONTRIBUTION_NAME" />
  Inline source citation. Place after the sentence it supports. Multiple <source /> tags may follow a single sentence when it draws from more than one contribution.`;

const MATH_TAG = `- <math>inline expression</math>
  Inline LaTeX math. Use for variables, symbols, and short expressions within a sentence (e.g. <math>E = mc^2</math>).

- <math display="block">
  multi-line or large expression
  </math>
  Block-level LaTeX math. Use for equations, derivations, or any formula that deserves its own line. Must appear on its own line with a blank line before and after it.`;

function buildXmlTagReference(settings: CompilationSettings): string {
  const tags = [
    settings.conflictResolution === "replace_flag" ? RESOLVED_TAG : CONFLICT_TAG,
    settings.factChecking === "flag" ? FLAGGED_TAG_FLAG : null,
    settings.factChecking === "replace" ? FLAGGED_TAG_REPLACE : null,
    settings.sourcesInline ? SOURCE_TAG : null,
    MATH_TAG,
  ].filter(Boolean).join("\n\n");
  if (!tags.length) return "";
  return `## Custom XML Tags\nUse these tags within your markdown output:\n\n${tags}`;
}

function formatContributions(contributions: ContributionForPrompt[]): string {
  return contributions
    .map(
      (c) =>
        `=== "${c.name}" | By: ${c.uploaderName}${c.pinned ? " | PINNED" : ""} | ID: ${c.id} ===\n${c.text}`,
    )
    .join("\n\n");
}

export function buildPrompt(
  contributions: ContributionForPrompt[],
  settings: CompilationSettings,
  previousContext: string,
  isFinal: boolean,
  existingDocument?: string,
): string {
  const sections: string[] = [];

  sections.push(
    existingDocument
      ? "You are updating a master document for a university course topic by merging in new student contributions."
      : "You are compiling student contributions into a single master document for a university course topic.",
  );

  sections.push(buildXmlTagReference(settings));

  sections.push(`## Instructions
- ${OUTPUT_TYPE[settings.outputType]}
- ${DEPTH[settings.depth]}
- ${CONFLICT_RESOLUTION[settings.conflictResolution]}
- ${FACT_CHECK[settings.factChecking]}
- ${settings.sourcesInline ? "Add <source /> tags inline after sentences that draw from a specific contribution." : "Do not add inline source citations."}`);

  if (existingDocument) {
    sections.push(
      `## Existing Document\nThis is the current version. Preserve all its content unless a new contribution directly contradicts it with a higher-priority source or a factual correction.\n\n${existingDocument}`,
    );
  }

  if (previousContext) {
    sections.push(`## Context from Previous Pass\n${previousContext}`);
  }

  sections.push(`## New Contributions\n${formatContributions(contributions)}`);

  if (isFinal) {
    sections.push(
      existingDocument
        ? "Write the updated master document in markdown now, integrating the new contributions into the existing document. Do not include any preamble or explanation — output only the document itself."
        : "Write the complete master document in markdown now. Do not include any preamble or explanation — output only the document itself.",
    );
  } else {
    sections.push(
      `Do not write the master document yet. Another pass will handle that with more contributions.

Instead, output a context block in this exact format so the next pass can build on your work:

<previous-pass-context>
## Themes Established
[key themes and topics covered by these contributions]

## Key Facts & Claims
[important facts, definitions, and claims from the sources]

## Conflicts Found
[any disagreements between sources, even tentative ones]

## Structure Suggestion
[a brief outline for how the final document could be structured]
</previous-pass-context>

Output only the context block — nothing else.`,
    );
  }

  return sections.join("\n\n");
}
