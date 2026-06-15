import { db } from "@/server/db";
import { classes, topics } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TopicTabs } from "@/components/topic-tabs";
import type { ReactNode } from "react";

const HomeIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </svg>
);

const BellIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

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
      .where(eq(topics.id, topicId))
      .limit(1),
  ]);

  if (!cls[0] || !topic[0]) notFound();

  const base = `/home/${classId}/${topicId}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
      <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
    </div>
  );
}
