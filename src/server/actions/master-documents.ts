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
  userClasses,
  topics,
  RANK_VALUE,
} from "@/server/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import {
  getUserRank,
  rateLimit,
  requireRank,
  topicBelongsToClass,
} from "./shared";
import { logActivity } from "@/lib/activity-log";
import { stripNullBytes } from "@/lib/utils";
import {
  getTemporalClient,
  checkTemporalReady,
  TASK_QUEUE,
} from "@/temporal/client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

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

const s3 = new S3Client({ region: process.env.AWS_REGION! });

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
  const limit = await rateLimit(session.user.id, "createMasterDocument");
  if (limit) return limit;

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

    // A client-requested incremental compile is only meaningful if there's a
    // ready document to build on — otherwise treat it as from-scratch
    // regardless of what the client sent, so contributions never get
    // silently skipped for lack of a base document that doesn't exist.
    const [prevReadyDoc] = await db
      .select({ id: masterDocuments.id })
      .from(masterDocuments)
      .where(
        and(
          eq(masterDocuments.topicId, topicId),
          eq(masterDocuments.status, "ready"),
        ),
      )
      .limit(1);
    const fromScratch = settings.fromScratch || !prevReadyDoc;

    if (!fromScratch) {
      const [newContrib] = await db
        .select({ id: contributions.id })
        .from(contributions)
        .where(
          and(
            eq(contributions.topicId, topicId),
            eq(contributions.status, "ready"),
          ),
        )
        .limit(1);
      if (!newContrib) return { error: "No new contributions to compile." };
    }

    const health = await checkTemporalReady();
    if (!health.ok)
      return {
        error: "Compilation service is unavailable. Try again shortly.",
      };

    const masterDocumentId = crypto.randomUUID();
    await db.insert(masterDocuments).values({
      id: masterDocumentId,
      triggeredBy: session.user.id,
      topicId,
      outputType: settings.outputType,
      depth: settings.depth,
      conflictResolution: settings.conflictResolution,
      factChecking: settings.factChecking,
      sourcesInline: settings.sourcesInline,
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
    try {
      await temporalClient.workflow.start("compileContributions", {
        args: [masterDocumentId, topicId, { ...settings, fromScratch }],
        taskQueue: TASK_QUEUE,
        workflowId: `compile-${masterDocumentId}`,
      });
    } catch (e) {
      await db
        .delete(masterDocuments)
        .where(eq(masterDocuments.id, masterDocumentId));
      throw e;
    }

    logActivity(
      classId,
      session.user.id,
      { action: "compilation_triggered" },
      topicId,
    );
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
      pdfStatus: masterDocuments.pdfStatus,
      manuallyEdited: masterDocuments.manuallyEdited,
    })
    .from(masterDocuments)
    .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
    .innerJoin(
      userClasses,
      and(
        eq(userClasses.classId, topics.classId),
        eq(userClasses.userId, session.user.id),
      ),
    )
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
    .leftJoin(
      contributions,
      eq(compilationSources.contributionId, contributions.id),
    )
    .where(eq(compilationSources.masterDocumentId, masterDocumentId));

  const sources: { id: string; name: string }[] = [];
  const deletedSourceNames: string[] = [];
  const sourceIds: string[] = [];
  const uploaderSet = new Set<string>();
  const seenContributionIds = new Set<string>();

  for (const r of sourceRows) {
    if (r.contributionId && r.contributionName) {
      if (!seenContributionIds.has(r.contributionId)) {
        seenContributionIds.add(r.contributionId);
        sources.push({ id: r.contributionId, name: r.contributionName });
        sourceIds.push(r.contributionId);
      }
    } else if (!r.contributionId && r.snapshotName) {
      deletedSourceNames.push(r.snapshotName);
    }
    if (r.uploadedBy) uploaderSet.add(r.uploadedBy);
  }

  return {
    ...doc,
    sources,
    sourceIds,
    deletedSourceNames,
    contributorIds: [...uploaderSet],
  };
}

export async function createPDF(
  classId: string,
  masterDocumentId: string,
  force: boolean,
): Promise<
  { error: string } | { success: true; generating: boolean; url?: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const limit = await rateLimit(session.user.id, "createPDF");
  if (limit) return limit;

  try {
    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };

    const row = await db
      .select({
        pdfStatus: masterDocuments.pdfStatus,
        pdfS3Key: masterDocuments.pdfS3Key,
        topicId: masterDocuments.topicId,
      })
      .from(masterDocuments)
      .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
      .where(
        and(
          eq(masterDocuments.id, masterDocumentId),
          eq(topics.classId, classId),
        ),
      )
      .limit(1);
    if (!row[0]) return { error: "This master document does not exist." };

    if (row[0].pdfS3Key && !force && row[0].pdfStatus !== "generating") {
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: row[0].pdfS3Key,
        }),
        { expiresIn: 300 },
      );
      return { success: true, generating: false, url: signedUrl };
    }

    const [updated] = await db
      .update(masterDocuments)
      .set({
        pdfStatus: "generating",
        pdfS3Key: null,
        pdfGenerationStartedAt: new Date(),
      })
      .where(
        and(
          eq(masterDocuments.id, masterDocumentId),
          ne(masterDocuments.pdfStatus, "generating"),
        ),
      )
      .returning({ id: masterDocuments.id });

    if (!updated) return { success: true, generating: true };

    if (row[0].pdfS3Key) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: row[0].pdfS3Key,
          }),
        );
      } catch (cleanupError) {
        console.error(
          `ERROR deleting S3 object for master document ${row[0].pdfS3Key}: `,
          cleanupError,
        );
      }
    }

    const resetPdfStatus = () =>
      db
        .update(masterDocuments)
        .set({ pdfStatus: "pending", pdfGenerationStartedAt: null })
        .where(eq(masterDocuments.id, masterDocumentId));

    const health = await checkTemporalReady();
    if (!health.ok) {
      await resetPdfStatus();
      return { error: "PDF service is unavailable. Try again shortly." };
    }

    const temporalClient = await getTemporalClient();
    try {
      await temporalClient.workflow.start("runPDFGeneration", {
        args: [classId, row[0].topicId, masterDocumentId],
        taskQueue: TASK_QUEUE,
        workflowId: `pdf-${masterDocumentId}`,
      });
    } catch (e) {
      await resetPdfStatus();
      throw e;
    }

    return { success: true, generating: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function updateMasterDocumentContent(
  classId: string,
  masterDocumentId: string,
  content: string,
): Promise<{ error: string } | { success: true }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const limit = await rateLimit(session.user.id, "updateMasterDocumentContent");
  if (limit) return limit;

  try {
    const [membership] = await db
      .select({
        rank: userClasses.rank,
        minRankEditCompilation: classes.minRankEditCompilation,
      })
      .from(userClasses)
      .innerJoin(classes, eq(classes.id, userClasses.classId))
      .where(
        and(
          eq(userClasses.userId, session.user.id),
          eq(userClasses.classId, classId),
        ),
      )
      .limit(1);

    if (!membership) return { error: "You are not a member of this class." };
    if (
      RANK_VALUE[membership.rank] <
      RANK_VALUE[membership.minRankEditCompilation]
    )
      return { error: "Your rank is not high enough to edit this document." };

    const [doc] = await db
      .select({ id: masterDocuments.id })
      .from(masterDocuments)
      .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
      .where(
        and(
          eq(masterDocuments.id, masterDocumentId),
          eq(topics.classId, classId),
        ),
      )
      .limit(1);

    if (!doc) return { error: "Document not found." };

    await db
      .update(masterDocuments)
      .set({
        content: stripNullBytes(content),
        pdfStatus: "pending",
        pdfS3Key: null,
        manuallyEdited: true,
      })
      .where(eq(masterDocuments.id, masterDocumentId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteMasterDocument(
  classId: string,
  masterDocumentId: string,
): Promise<{ error: string } | { success: true }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const limit = await rateLimit(session.user.id, "deleteMasterDocument");
  if (limit) return limit;

  try {
    const [membership] = await db
      .select({
        rank: userClasses.rank,
        minRankEditCompilation: classes.minRankEditCompilation,
      })
      .from(userClasses)
      .innerJoin(classes, eq(classes.id, userClasses.classId))
      .where(
        and(
          eq(userClasses.userId, session.user.id),
          eq(userClasses.classId, classId),
        ),
      )
      .limit(1);

    if (!membership) return { error: "You are not a member of this class." };
    if (
      RANK_VALUE[membership.rank] <
      RANK_VALUE[membership.minRankEditCompilation]
    )
      return { error: "Your rank is not high enough to delete this document." };

    const [doc] = await db
      .select({ id: masterDocuments.id, pdfS3Key: masterDocuments.pdfS3Key })
      .from(masterDocuments)
      .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
      .where(
        and(
          eq(masterDocuments.id, masterDocumentId),
          eq(topics.classId, classId),
        ),
      )
      .limit(1);

    if (!doc) return { error: "Document not found." };

    if (doc.pdfS3Key) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: doc.pdfS3Key,
          }),
        );
      } catch (e) {
        console.error("S3 delete error:", e);
      }
    }

    await db
      .delete(masterDocuments)
      .where(eq(masterDocuments.id, masterDocumentId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
