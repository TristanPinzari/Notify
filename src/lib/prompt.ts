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
    "When sources conflict, trust the pinned contribution's version and write it as fact. Only use <conflict> when pinned sources themselves disagree with each other.",
  trust_majority:
    "When sources conflict, go with the majority view and write it as fact. Use <conflict> to note significant minority positions.",
  flag_all:
    "Do not resolve conflicts. Wrap every conflicting claim in <conflict>...</conflict> showing what each side says.",
};

const FACT_CHECK = {
  none: "Do not fact-check or alter any claims — reproduce what the sources say.",
  flag: "If a claim seems factually dubious, wrap it in <flagged>...</flagged> but keep it in the document.",
  replace:
    "If a claim is factually incorrect, replace it with the correct information but wrap it in <flagged original=\"what the source said\">corrected claim</flagged> so the reader knows it was changed.",
};

const XML_TAG_REFERENCE = `
## Custom XML Tags
Use these tags within your markdown output:

- <conflict>Source A says X. Source B says Y.</conflict>
  Use when two or more sources disagree on a claim.

- <flagged>suspicious claim here</flagged>
  Use when a claim appears factually dubious.

- <flagged original="what the source said">corrected claim</flagged>
  Use when a claim was factually incorrect and you have replaced it — preserve what the source originally said in the original attribute.

- <source id="CONTRIBUTION_ID" name="CONTRIBUTION_NAME" />
  Inline source citation. Place after the sentence it supports.
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
): string {
  const sections: string[] = [];

  sections.push(
    "You are compiling student contributions into a single master document for a university course topic.",
  );

  sections.push(XML_TAG_REFERENCE);

  sections.push(`## Instructions
- ${OUTPUT_TYPE[settings.outputType]}
- ${DEPTH[settings.depth]}
- ${CONFLICT_RESOLUTION[settings.conflictResolution]}
- ${FACT_CHECK[settings.factChecking]}
- ${settings.sourcesInline ? "Add <source /> tags inline after sentences that draw from a specific contribution." : "Do not add inline source citations."}`);

  if (previousContext) {
    sections.push(`## Context from Previous Pass\n${previousContext}`);
  }

  sections.push(`## Contributions\n${formatContributions(contributions)}`);

  if (isFinal) {
    sections.push(
      "Write the complete master document in markdown now. Do not include any preamble or explanation — output only the document itself.",
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
