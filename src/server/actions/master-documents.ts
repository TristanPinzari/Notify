"use server";

import { db } from "@/server/db";
import {
  classes,
  docOutputType,
  docDepth,
  docConflictResolution,
  docFactCheck,
  masterDocuments,
  compilationSources,
  contributions,
} from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { requireRank, topicBelongsToClass } from "./shared";
import { getTemporalClient } from "@/temporal/client";

type DocOutputType = (typeof docOutputType.enumValues)[number];
type DocDepth = (typeof docDepth.enumValues)[number];
type DocConflictResolution = (typeof docConflictResolution.enumValues)[number];
type DocFactCheck = (typeof docFactCheck.enumValues)[number];

export type CompilationSettings = {
  outputType: DocOutputType;
  depth: DocDepth;
  conflictResolution: DocConflictResolution;
  factChecking: DocFactCheck;
  sourcesInline: boolean;
  fromScratch: boolean;
};

export async function createMasterDocument(
  classId: string,
  topicId: string,
  settings: CompilationSettings,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    console.error("ERROR: createMasterDocument called with no session");
    return { error: "Not authenticated." };
  }

  try {
    if (!(await topicBelongsToClass(classId, topicId))) {
      console.error(
        `ERROR: topic ${topicId} does not belong to class ${classId}`,
      );
      return { error: "Topic does not belong to this class." };
    }

    const [cls] = await db
      .select({ minRankTriggerCompilation: classes.minRankTriggerCompilation })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls) {
      console.error(`ERROR: class ${classId} does not exist`);
      return { error: "Class does not exist." };
    }

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls.minRankTriggerCompilation,
      "trigger compilation",
    );
    if ("error" in allowed) {
      console.error(`ERROR: ${allowed.error}`);
      return allowed;
    }

    if (!settings.fromScratch) {
      const [newContrib] = await db
        .select({ id: contributions.id })
        .from(contributions)
        .where(and(eq(contributions.topicId, topicId), eq(contributions.status, "ready")))
        .limit(1);
      if (!newContrib) return { error: "No new contributions to compile." };
    }

    const masterDocumentId = crypto.randomUUID();
    const { fromScratch, ...docSettings } = settings;
    await db.insert(masterDocuments).values({
      id: masterDocumentId,
      triggeredBy: session.user.id,
      topicId,
      ...docSettings,
    });

    if (fromScratch)
      await db
        .update(contributions)
        .set({ status: "ready" })
        .where(
          and(
            eq(contributions.topicId, topicId),
            eq(contributions.status, "compiled"),
          ),
        );

    const temporalClient = await getTemporalClient();
    await temporalClient.workflow.start("compileContributions", {
      args: [masterDocumentId, topicId, settings],
      taskQueue: "main",
      workflowId: `compile-${masterDocumentId}-${Date.now()}`,
    });

    return { success: true, masterDocumentId };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function getMasterDocumentStatus(masterDocumentId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  const [doc] = await db
    .select({
      status: masterDocuments.status,
      content: masterDocuments.content,
      failureReason: masterDocuments.failureReason,
    })
    .from(masterDocuments)
    .where(eq(masterDocuments.id, masterDocumentId))
    .limit(1);

  if (!doc) return { error: "Document not found." };

  const sourceRows = await db
    .select({
      contributionId: compilationSources.contributionId,
      contributionName: contributions.name,
      snapshotName: compilationSources.snapshotName,
      uploadedBy: compilationSources.snapshotUploadedBy,
    })
    .from(compilationSources)
    .leftJoin(contributions, eq(compilationSources.contributionId, contributions.id))
    .where(eq(compilationSources.masterDocumentId, masterDocumentId));

  const sources: { id: string; name: string }[] = [];
  const deletedSourceNames: string[] = [];
  const sourceIds: string[] = [];
  const uploaderSet = new Set<string>();

  for (const r of sourceRows) {
    if (r.contributionId && r.contributionName) {
      sources.push({ id: r.contributionId, name: r.contributionName });
      sourceIds.push(r.contributionId);
    } else if (!r.contributionId && r.snapshotName) {
      deletedSourceNames.push(r.snapshotName);
    }
    if (r.uploadedBy) uploaderSet.add(r.uploadedBy);
  }

  return { ...doc, sources, sourceIds, deletedSourceNames, contributorIds: [...uploaderSet] };
}
