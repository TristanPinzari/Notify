import type { Metadata } from "next";
import CollectionView from "@/components/collection-view";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  classes,
  contributions,
  RANK_VALUE,
  topics,
  user,
  userClasses,
} from "@/server/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { parseIds } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";

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
  return { title: topic ? `${topic.name} · Collection` : "Collection" };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; topicId: string }>;
  searchParams: Promise<{ sources?: string; reason?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { classId, topicId } = await params;
  const { sources: sourcesParam, reason } = await searchParams;
  const highlightSources = parseIds(sourcesParam);

  const [rows, [cls], [member]] = await Promise.all([
    db
      .select({
        contributionId: contributions.id,
        contributionName: contributions.name,
        contributionType: contributions.type,
        extractionMethod: contributions.extractionMethod,
        status: contributions.status,
        failureReason: contributions.failureReason,
        manuallyEdited: contributions.manuallyEdited,
        pinned: contributions.pinned,
        uploaderName: user.name,
        uploaderId: user.id,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .leftJoin(user, eq(contributions.uploadedBy, user.id))
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .where(
        and(eq(contributions.topicId, topicId), eq(topics.classId, classId)),
      )
      .orderBy(desc(contributions.createdAt)),
    db
      .select({
        minRankUploadContribution: classes.minRankUploadContribution,
        minRankDeleteContribution: classes.minRankDeleteContribution,
        minRankPinContribution: classes.minRankPinContribution,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1),
    db
      .select({ rank: userClasses.rank })
      .from(userClasses)
      .where(
        and(
          eq(userClasses.classId, classId),
          eq(userClasses.userId, session.user.id),
        ),
      )
      .limit(1),
  ]);

  if (!cls) notFound();
  if (!member) redirect("/home");

  const canUpload =
    RANK_VALUE[member.rank] >= RANK_VALUE[cls.minRankUploadContribution];
  const canDelete =
    RANK_VALUE[member.rank] >= RANK_VALUE[cls.minRankDeleteContribution];
  const canPin =
    RANK_VALUE[member.rank] >= RANK_VALUE[cls.minRankPinContribution];

  const serialized = rows.map((r) => ({
    ...r,
    uploaderName: r.uploaderName ?? "Deleted user",
    uploaderId: r.uploaderId ?? "",
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <CollectionView
      contributions={serialized}
      canUpload={canUpload}
      canDelete={canDelete}
      canPin={canPin}
      classId={classId}
      topicId={topicId}
      currentUserId={session.user.id}
      highlightSources={highlightSources}
      filterReason={reason}
    />
  );
}
