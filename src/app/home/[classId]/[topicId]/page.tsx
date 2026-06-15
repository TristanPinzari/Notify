import { db } from "@/server/db";
import {
  masterDocuments,
  contributions,
  compileLogs,
  topics,
} from "@/server/db/schema";
import { eq, count, countDistinct, desc } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MasterDocView } from "@/components/master-doc-view";

export default async function MasterDocPage({
  params,
}: {
  params: Promise<{ classId: string; topicId: string }>;
}) {
  const { topicId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  const [topicRows, docRows, statsRows, compileRows] = await Promise.all([
    db
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1),
    db
      .select({ content: masterDocuments.content })
      .from(masterDocuments)
      .where(eq(masterDocuments.topicId, topicId))
      .limit(1),
    db
      .select({
        contributors: countDistinct(contributions.uploadedBy),
        sources: count(contributions.id),
      })
      .from(contributions)
      .where(eq(contributions.topicId, topicId)),
    db
      .select({ createdAt: compileLogs.createdAt })
      .from(compileLogs)
      .where(eq(compileLogs.topicId, topicId))
      .orderBy(desc(compileLogs.createdAt))
      .limit(1),
  ]);

  if (!topicRows[0]) notFound();

  const stats = statsRows[0];

  return (
    <MasterDocView
      topicName={topicRows[0].name}
      content={docRows[0]?.content ?? null}
      contributors={stats?.contributors ?? 0}
      sources={stats?.sources ?? 0}
      lastCompiledAt={compileRows[0]?.createdAt?.toISOString() ?? null}
    />
  );
}
