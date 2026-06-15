import { db } from "@/server/db";
import { userClasses } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export async function getUserRank(classId: string, userId: string) {
  const membership = await db
    .select({ rank: userClasses.rank })
    .from(userClasses)
    .where(
      and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
    )
    .limit(1);

  return membership[0]?.rank;
}
