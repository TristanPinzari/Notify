import type { Metadata } from "next";
import { db } from "@/server/db";
import {
  classes,
  userClasses,
  topics,
  contributions,
  masterDocuments,
} from "@/server/db/schema";
import { eq, desc, count, inArray, sql, max } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClassesView from "@/components/classes-view";
import { JoinCodeHandler } from "@/components/join-code-handler";
import { MobileMenuButton } from "@/components/mobile-menu-btn";
import { NotificationBell } from "@/components/notification-bell";
import { HomeIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;
  const { code } = await searchParams;

  const classRows = await db
    .select({ id: classes.id, name: classes.name, rank: userClasses.rank })
    .from(userClasses)
    .innerJoin(classes, eq(userClasses.classId, classes.id))
    .where(eq(userClasses.userId, userId))
    .orderBy(desc(userClasses.joinedAt));

  const classIds = classRows.map((r) => r.id);

  const [topicCounts, memberCounts, contribRows, lastCompilationRows] =
    classIds.length > 0
      ? await Promise.all([
          db
            .select({ classId: topics.classId, count: count() })
            .from(topics)
            .where(inArray(topics.classId, classIds))
            .groupBy(topics.classId),
          db
            .select({ classId: userClasses.classId, count: count() })
            .from(userClasses)
            .where(inArray(userClasses.classId, classIds))
            .groupBy(userClasses.classId),
          db
            .select({
              classId: topics.classId,
              myCount: sql<number>`cast(count(*) filter (where ${contributions.uploadedBy} = ${userId}) as int)`,
              lastUpload: max(contributions.createdAt),
            })
            .from(contributions)
            .innerJoin(topics, eq(contributions.topicId, topics.id))
            .where(inArray(topics.classId, classIds))
            .groupBy(topics.classId),
          db
            .select({
              classId: topics.classId,
              lastCompilation: max(masterDocuments.createdAt),
            })
            .from(masterDocuments)
            .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
            .where(inArray(topics.classId, classIds))
            .groupBy(topics.classId),
        ])
      : [[], [], [], []];

  const topicMap = new Map(topicCounts.map((r) => [r.classId, r.count]));
  const memberMap = new Map(memberCounts.map((r) => [r.classId, r.count]));
  const contribMap = new Map(contribRows.map((r) => [r.classId, r]));
  const lastCompilationMap = new Map(
    lastCompilationRows.map((r) => [r.classId, r.lastCompilation]),
  );

  const enriched = classRows.map((r) => {
    const contrib = contribMap.get(r.id);
    const upload = contrib?.lastUpload ?? null;
    const compilation = lastCompilationMap.get(r.id) ?? null;
    const lastActivity =
      (upload && compilation
        ? upload > compilation
          ? upload
          : compilation
        : (upload ?? compilation)
      )?.toISOString() ?? null;
    return {
      ...r,
      topicCount: topicMap.get(r.id) ?? 0,
      memberCount: memberMap.get(r.id) ?? 0,
      yourContributions: contrib?.myCount ?? 0,
      lastActivity,
    };
  });

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 shrink-0 flex items-center gap-3.5 px-5.5 border-b border-(--line-soft) bg-(--paper)">
        <div className="flex items-center gap-2.25 text-[13.5px] min-w-0">
          <span className="flex text-(--ink-fainter)">
            <HomeIcon />
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <MobileMenuButton />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-gutter-stable"
      >
        <ClassesView classes={enriched} />
      </div>
      {code && <JoinCodeHandler code={code} />}
    </div>
  );
}
