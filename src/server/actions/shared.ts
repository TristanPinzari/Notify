import { db } from "@/server/db";
import {
  classes,
  contributions,
  Rank,
  RANK_VALUE,
  topics,
  userClasses,
} from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export async function classExists(classId: string) {
  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return !!cls;
}

export async function topicBelongsToClass(classId: string, topicId: string) {
  const [topic] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.classId, classId)))
    .limit(1);
  return !!topic;
}

export async function contributionBelongsToClass(
  classId: string,
  contributionId: string,
) {
  const [row] = await db
    .select({ id: contributions.id })
    .from(contributions)
    .innerJoin(topics, eq(contributions.topicId, topics.id))
    .where(
      and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
    )
    .limit(1);
  return !!row;
}

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

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

export async function requireRank(
  classId: string,
  userId: string,
  minRank: Rank,
  action: string,
): Promise<{ error: string } | { rank: Rank }> {
  const rank = await getUserRank(classId, userId);
  if (!rank) return { error: "You are not a member of this class." };
  if (RANK_VALUE[minRank] > RANK_VALUE[rank])
    return { error: `Your rank is not high enough to ${action}.` };
  return { rank };
}
