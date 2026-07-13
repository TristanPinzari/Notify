import { db } from "@/server/db";
import { userClasses, classes, topics } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export type SidebarClass = {
  id: string;
  code: string;
  name: string;
  topics: { id: string; name: string }[];
};

export async function getSidebarClasses(
  userId: string,
): Promise<SidebarClass[]> {
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
    .where(eq(userClasses.userId, userId))
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
      classMap
        .get(row.classId)!
        .topics.push({ id: row.topicId, name: row.topicName });
    }
  }

  return Array.from(classMap.values());
}
