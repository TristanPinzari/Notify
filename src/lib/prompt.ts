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
    "When two uploaded contributions state different facts about the same thing, trust the pinned contribution's version and write it as fact. Only use <conflict> when pinned contributions themselves disagree with each other on a factual point.",
  trust_majority:
    "When two uploaded contributions state different facts about the same thing, go with the majority version and write it as fact. Only use <conflict> to flag a significant factual discrepancy that cannot be resolved by majority.",
  flag_all:
    "When two uploaded contributions state different facts about the same thing, wrap the discrepancy in <conflict>...</conflict>. The a and b attributes should be the names of the two contributions, not names of people being discussed.",
};

const FACT_CHECK = {
  none: "Do not fact-check or alter any claims — reproduce what the sources say.",
  flag: "If a claim seems factually dubious, wrap it in <flagged correction=\"your suggested correction\">paraphrased original claim</flagged> — paraphrase what the source said inside the tags and put the correct version in the correction attribute.",
  replace:
    "If a claim is clearly factually incorrect, write the correction inside <flagged original=\"paraphrased original claim\">correction</flagged> — put your correction inside the tags and a clean paraphrase of what the source said in the original attribute. Never quote verbatim, especially transcribed speech.",
};

const XML_TAG_REFERENCE = `
## Custom XML Tags
Use these tags within your markdown output:

- <conflict a="Name of first source" b="Name of second source">Source A says X. Source B says Y.</conflict>
  Use ONLY when two uploaded student contributions state different facts about the same thing — e.g. one source says a date is 1776 and another says 1778, or one source attributes a quote to person A and another to person B. The a and b attributes are the names of the conflicting contributions, not the names of historical figures or theorists being discussed. Do NOT use <conflict> for differences of opinion, philosophical disagreement, or academic debate — those are part of the subject matter and should be written as normal prose. CRITICAL: both a and b must be the names of real uploaded contributions — never use placeholders like "No specific conflicting source", "Unknown", or any value that is not an actual contribution name. If only one source makes a claim, use <flagged> instead, not <conflict>. IMPORTANT: <conflict> must appear on its own dedicated line with a blank line before and after it — never appended to a sentence, never on the same line as any other text. The line must contain nothing except the opening tag, its content, and the closing tag.

- <flagged correction="AI suggested correction">paraphrased original claim</flagged>
  Use when a source makes a dubious claim — paraphrase the original claim cleanly inside the tags and put your suggested correction in the correction attribute. The original is shown to the reader; the correction appears on hover.

- <flagged original="paraphrased original claim">correction</flagged>
  Use when a claim is clearly wrong and you are replacing it — write the correction inside the tags and put a clean paraphrase of what the source said in the original attribute. The correction is shown to the reader; the original appears on hover. Never quote verbatim, especially transcribed speech.

- <source id="CONTRIBUTION_ID" name="CONTRIBUTION_NAME" />
  Inline source citation. Place after the sentence it supports. Multiple <source /> tags may follow a single sentence when it draws from more than one contribution.
`.trim();

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

  sections.push(XML_TAG_REFERENCE);

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
