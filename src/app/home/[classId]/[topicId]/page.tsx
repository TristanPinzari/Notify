import type { Metadata } from "next";
import { db } from "@/server/db";
import {
  masterDocuments,
  compilationSources,
  topics,
  userClasses,
  classes,
  RANK_VALUE,
} from "@/server/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MasterDocView } from "@/components/master-doc-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ classId: string; topicId: string }>;
}): Promise<Metadata> {
  const { topicId } = await params;
  const [topic] = await db
    .select({ name: topics.name })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return { title: topic?.name ?? "Notes" };
}

export default async function MasterDocPage({
  params,
}: {
  params: Promise<{ classId: string; topicId: string }>;
}) {
  const { classId, topicId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  const [topicRows, docRows, memberRows] = await Promise.all([
    db
      .select({ name: topics.name })
      .from(topics)
      .innerJoin(
        userClasses,
        and(
          eq(userClasses.classId, topics.classId),
          eq(userClasses.userId, session.user.id),
        ),
      )
      .where(and(eq(topics.id, topicId), eq(topics.classId, classId)))
      .limit(1),

    db
      .select({
        id: masterDocuments.id,
        status: masterDocuments.status,
        content: masterDocuments.content,
        failureReason: masterDocuments.failureReason,
        outputType: masterDocuments.outputType,
        depth: masterDocuments.depth,
        conflictResolution: masterDocuments.conflictResolution,
        factChecking: masterDocuments.factChecking,
        sourcesInline: masterDocuments.sourcesInline,
        createdAt: masterDocuments.createdAt,
      })
      .from(masterDocuments)
      .where(eq(masterDocuments.topicId, topicId))
      .orderBy(desc(masterDocuments.createdAt))
      .limit(4),

    db
      .select({
        rank: userClasses.rank,
        minRankTriggerCompilation: classes.minRankTriggerCompilation,
      })
      .from(userClasses)
      .innerJoin(classes, eq(classes.id, userClasses.classId))
      .where(
        and(
          eq(userClasses.userId, session.user.id),
          eq(userClasses.classId, classId),
        ),
      )
      .limit(1),
  ]);

  if (!topicRows[0]) notFound();

  const allSourceRows =
    docRows.length > 0
      ? await db
          .select({
            masterDocumentId: compilationSources.masterDocumentId,
            contributionId: compilationSources.contributionId,
            uploadedBy: compilationSources.snapshotUploadedBy,
          })
          .from(compilationSources)
          .where(
            inArray(
              compilationSources.masterDocumentId,
              docRows.map((d) => d.id),
            ),
          )
      : [];

  const sourcesByDoc: Record<
    string,
    { sourceIds: string[]; contributorIds: string[] }
  > = {};
  for (const r of allSourceRows) {
    if (!sourcesByDoc[r.masterDocumentId])
      sourcesByDoc[r.masterDocumentId] = { sourceIds: [], contributorIds: [] };
    if (r.contributionId)
      sourcesByDoc[r.masterDocumentId].sourceIds.push(r.contributionId);
    if (
      r.uploadedBy &&
      !sourcesByDoc[r.masterDocumentId].contributorIds.includes(r.uploadedBy)
    )
      sourcesByDoc[r.masterDocumentId].contributorIds.push(r.uploadedBy);
  }

  const serializedDocs = docRows.map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
    sourceIds: sourcesByDoc[d.id]?.sourceIds ?? [],
    contributorIds: sourcesByDoc[d.id]?.contributorIds ?? [],
  }));

  const member = memberRows[0];
  const canCompile = member
    ? RANK_VALUE[member.rank] >= RANK_VALUE[member.minRankTriggerCompilation]
    : false;

  return (
    <MasterDocView
      classId={classId}
      topicId={topicId}
      topicName={topicRows[0].name}
      canCompile={canCompile}
      masterDocs={serializedDocs}
    />
  );
}
