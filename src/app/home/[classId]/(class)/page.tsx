import type { Metadata } from "next";
import { db } from "@/server/db";
import {
  classes,
  contributions,
  compilationSources,
  masterDocuments,
  topics,
  userClasses,
  RANK_VALUE,
} from "@/server/db/schema";
import { count, desc, eq, and, inArray, sql, max } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import TopicsView from "@/components/topics-view";

export const metadata: Metadata = { title: "Topics" };

export default async function ClassTopicsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;

  const [[cls], [member], topicRows] = await Promise.all([
    db
      .select({ name: classes.name, minRankCreateTopic: classes.minRankCreateTopic })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1),

    db
      .select({ rank: userClasses.rank })
      .from(userClasses)
      .where(and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)))
      .limit(1),

    db
      .select({ id: topics.id, name: topics.name, createdAt: topics.createdAt })
      .from(topics)
      .where(eq(topics.classId, classId))
      .orderBy(desc(topics.createdAt)),
  ]);

  if (!cls) notFound();
  if (!member) redirect("/home");

  const topicIds = topicRows.map((t) => t.id);

  const [statsRows, allDocRows] = topicIds.length === 0
    ? [[], []]
    : await Promise.all([
        db
          .select({
            topicId: contributions.topicId,
            total: count(),
            contributors: sql<number>`cast(count(distinct ${contributions.uploadedBy}) as int)`,
            yours: sql<number>`cast(sum(case when ${contributions.uploadedBy} = ${userId} then 1 else 0 end) as int)`,
            lastUpload: max(contributions.createdAt),
          })
          .from(contributions)
          .where(inArray(contributions.topicId, topicIds))
          .groupBy(contributions.topicId),

        db
          .select({
            topicId: masterDocuments.topicId,
            id: masterDocuments.id,
            status: masterDocuments.status,
            createdAt: masterDocuments.createdAt,
          })
          .from(masterDocuments)
          .where(inArray(masterDocuments.topicId, topicIds))
          .orderBy(masterDocuments.topicId, desc(masterDocuments.createdAt)),
      ]);

  // Pick the most recent master doc per topic (rows already sorted desc)
  const latestDocMap = new Map<string, { id: string; status: string; createdAt: Date }>();
  for (const doc of allDocRows) {
    if (!latestDocMap.has(doc.topicId)) {
      latestDocMap.set(doc.topicId, { id: doc.id, status: doc.status, createdAt: doc.createdAt });
    }
  }

  // Count live compiled sources per latest master doc
  const latestDocIds = [...latestDocMap.values()].map((d) => d.id);
  const compiledCountRows =
    latestDocIds.length === 0
      ? []
      : await db
          .select({
            masterDocumentId: compilationSources.masterDocumentId,
            compiled: sql<number>`cast(count(${compilationSources.contributionId}) as int)`,
          })
          .from(compilationSources)
          .where(inArray(compilationSources.masterDocumentId, latestDocIds))
          .groupBy(compilationSources.masterDocumentId);

  const compiledMap = new Map(compiledCountRows.map((r) => [r.masterDocumentId, r.compiled]));
  const statsMap = new Map(statsRows.map((r) => [r.topicId, r]));

  const enrichedTopics = topicRows.map((t) => {
    const s = statsMap.get(t.id);
    const latestDoc = latestDocMap.get(t.id);
    const compiledCount = latestDoc ? (compiledMap.get(latestDoc.id) ?? 0) : 0;
    const total = s?.total ?? 0;
    return {
      id: t.id,
      name: t.name,
      createdAt: t.createdAt.toISOString(),
      sources: total,
      contributors: s?.contributors ?? 0,
      yourContributions: s?.yours ?? 0,
      status: (latestDoc?.status ?? "draft") as "compiling" | "ready" | "failed" | "draft",
      uncompiled: Math.max(0, total - compiledCount),
      lastActivity: (() => {
        const u = s?.lastUpload ?? null;
        const c = latestDoc?.createdAt ?? null;
        const d = u && c ? (u > c ? u : c) : (u ?? c);
        return d?.toISOString() ?? null;
      })(),
    };
  });

  return (
    <TopicsView
      classId={classId}
      className={cls.name}
      topics={enrichedTopics}
      canCreate={RANK_VALUE[member.rank] >= RANK_VALUE[cls.minRankCreateTopic]}
    />
  );
}
