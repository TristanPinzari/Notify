"use server";

import { db } from "@/server/db";
import {
  classes,
  docOutputType,
  docDepth,
  docConflictResolution,
  docFactCheck,
  masterDocuments,
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
};

export async function createMasterDocument(
  classId: string,
  topicId: string,
  settings: CompilationSettings,
  fromScratch: boolean,
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

    const masterDocumentId = crypto.randomUUID();
    await db.insert(masterDocuments).values({
      id: masterDocumentId,
      triggeredBy: session.user.id,
      topicId,
      ...settings,
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
