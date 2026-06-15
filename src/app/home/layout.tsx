import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { userClasses, classes, topics } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { Sidebar, type SidebarClass } from "@/components/sidebar";
import type { ReactNode } from "react";

export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const rows = await db
    .select({
      classId: classes.id,
      classCode: classes.code,
      className: classes.name,
      topicId: topics.id,
      topicName: topics.name,
    })
    .from(userClasses)
    .innerJoin(classes, eq(userClasses.classId, classes.id))
    .leftJoin(topics, eq(topics.classId, classes.id))
    .where(eq(userClasses.userId, session.user.id))
    .orderBy(userClasses.joinedAt, topics.createdAt);

  const classMap = new Map<string, SidebarClass>();
  for (const row of rows) {
    if (!classMap.has(row.classId)) {
      classMap.set(row.classId, {
        id: row.classId,
        code: row.classCode,
        name: row.className,
        topics: [],
      });
    }
    if (row.topicId && row.topicName) {
      classMap.get(row.classId)!.topics.push({
        id: row.topicId,
        name: row.topicName,
      });
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
        classes={Array.from(classMap.values())}
      />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
