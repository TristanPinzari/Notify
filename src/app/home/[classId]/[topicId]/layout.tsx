import { db } from "@/server/db";
import { classes, topics } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TopicTabs } from "@/components/topic-tabs";
import type { ReactNode } from "react";
import { HomeIcon, BellIcon } from "@/components/icons";

export default async function TopicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ classId: string; topicId: string }>;
}) {
  const { classId, topicId } = await params;

  const [cls, topic] = await Promise.all([
    db
      .select({ name: classes.name })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1),
    db
      .select({ name: topics.name })
      .from(topics)
      .where(and(eq(topics.id, topicId), eq(topics.classId, classId)))
      .limit(1),
  ]);

  if (!cls[0] || !topic[0]) notFound();

  const base = `/home/${classId}/${topicId}`;

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 shrink-0 flex items-center gap-3.5 px-5.5 border-b border-(--line-soft) bg-(--paper)">
        <div className="flex items-center gap-2.25 text-[13.5px] min-w-0">
          <span className="flex text-(--ink-fainter)"><HomeIcon /></span>
          <span className="text-(--ink-label) whitespace-nowrap">{cls[0].name}</span>
          <span className="text-(--ink-fainter)">/</span>
          <span className="text-(--ink) font-semibold overflow-hidden text-ellipsis whitespace-nowrap">{topic[0].name}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="icon-btn relative" title="Notifications">
            <BellIcon />
            <span className="absolute top-1.25 right-1.5 w-1.75 h-1.75 rounded-full bg-(--accent) border-[1.5px] border-(--paper)" />
          </button>
        </div>
      </div>
      <TopicTabs base={base} />
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ scrollbarGutter: "stable" }}>{children}</div>
    </div>
  );
}
