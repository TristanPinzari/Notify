import { db } from "@/server/db";
import {
  classes,
  contributions,
  rateLimits,
  Rank,
  RANK_VALUE,
  topics,
  user,
  userClasses,
} from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";

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

export async function getUserName(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.name ?? "Unknown";
}

export function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
}

const WINDOW_MS = 60 * 60 * 1000;

const RATE_LIMITS = {
  createClass: 5,
  joinClass: 20,
  createTopic: 20,
  createContribution: 30,
  sendClassInvites: 10,
  createMasterDocument: 10,
  sendFeedback: 5,
  getAvatarUploadUrl: 20,
  createPDF: 20,
  updateMasterDocumentContent: 60,
  deleteMasterDocument: 30,
} as const;

export async function rateLimit(
  userId: string,
  action: keyof typeof RATE_LIMITS,
): Promise<{ error: string } | null> {
  const max = RATE_LIMITS[action];
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  const windowStartISO = windowStart.toISOString();

  const [row] = await db
    .insert(rateLimits)
    .values({ userId, action, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.userId, rateLimits.action],
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} = ${windowStartISO} THEN ${rateLimits.count} + 1 ELSE 1 END`,
        windowStart: windowStart,
      },
    })
    .returning({ count: rateLimits.count });

  return (row?.count ?? 1) > max
    ? {
        error:
          "You have made too many requests. Please try again in less than an hour.",
      }
    : null;
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
