import type { Metadata } from "next";
import { db } from "@/server/db";
import { topics, classes, userClasses } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { TopicIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Topics" };

export default async function ClassTopicsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const [[cls], [member], topicRows] = await Promise.all([
    db
      .select({ name: classes.name })
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

    db
      .select({ id: topics.id, name: topics.name, createdAt: topics.createdAt })
      .from(topics)
      .where(eq(topics.classId, classId))
      .orderBy(topics.createdAt),
  ]);

  if (!cls) notFound();
  if (!member) redirect("/home");

  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      {topicRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-16 text-(--ink-faint)">
          <TopicIcon />
          <p className="text-[14px] m-0">No topics yet. Create one from the sidebar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {topicRows.map((topic) => (
            <Link
              key={topic.id}
              href={`/home/${classId}/${topic.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-(--line-soft) bg-(--paper-raised) hover:bg-(--paper-deep) transition-colors"
            >
              <span className="text-(--ink-faint) flex shrink-0"><TopicIcon /></span>
              <span className="text-[14px] font-medium text-(--ink)">{topic.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
