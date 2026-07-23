import { db } from "@/server/db";
import { classes } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ClassTabs } from "@/components/class-tabs";
import { HomeIcon } from "@/components/icons";
import { MobileMenuButton } from "@/components/mobile-menu-btn";
import { NotificationBell } from "@/components/notification-bell";
import type { ReactNode } from "react";

export default async function ClassLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  const [cls] = await db
    .select({ name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!cls) notFound();

  const base = `/home/${classId}`;

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 shrink-0 flex items-center gap-3.5 px-5.5 border-b border-(--line-soft) bg-(--paper)">
        <div className="flex items-center gap-2.25 text-[13.5px] min-w-0">
          <span className="flex text-(--ink-fainter)">
            <HomeIcon />
          </span>
          <span className="text-(--ink) font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
            {cls.name}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell classId={classId} />
          <MobileMenuButton />
        </div>
      </div>
      <ClassTabs base={base} />
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-gutter-stable">
        {children}
      </div>
    </div>
  );
}
