"use server";

import { db } from "@/server/db";
import {
  classes,
  userClasses,
  classBans,
  activityLogs,
  user,
  Rank,
  ClassSettings,
  RANK_VALUE,
} from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import {
  classExists,
  getUserName,
  getUserRank,
  isUniqueViolation,
  requireRank,
} from "./shared";
import { logActivity } from "@/lib/activity-log";

async function generateUniqueCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  let code;
  do {
    code = `${rand()}${rand()}${rand()}${rand()}-${rand()}${rand()}${rand()}${rand()}`;
  } while (
    (
      await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.code, code))
    ).length > 0
  );
  return code;
}

export async function createClass(name: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  name = name.trim();
  if (name.length < 3)
    return { error: "Class name must be at least three characters long." };

  try {
    const code = await generateUniqueCode();

    const classId = crypto.randomUUID();
    await db.insert(classes).values({ id: classId, name, code });
    await db
      .insert(userClasses)
      .values({ userId: session.user.id, classId, rank: "owner" });

    return { success: true, id: classId };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function joinClass(code: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const cls = await db
      .select({ id: classes.id, defaultRank: classes.defaultRank })
      .from(classes)
      .where(eq(classes.code, code))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };
    const { id: classId, defaultRank } = cls[0];

    const [banned, member] = await Promise.all([
      db
        .select({ reason: classBans.reason })
        .from(classBans)
        .where(and(eq(classBans.classId, classId), eq(classBans.bannedUserId, session.user.id)))
        .limit(1),
      db
        .select({ userId: userClasses.userId })
        .from(userClasses)
        .where(and(eq(userClasses.classId, classId), eq(userClasses.userId, session.user.id)))
        .limit(1),
    ]);

    if (banned.length > 0)
      return { error: "Banned from this class.", reason: banned[0].reason };
    if (member.length > 0)
      return { alreadyMember: true, id: classId };

    await db.insert(userClasses).values({ userId: session.user.id, classId, rank: defaultRank });

    logActivity(classId, session.user.id, { action: "member_joined" });
    return { success: true, id: classId };
  } catch (e) {
    if (isUniqueViolation(e)) return { alreadyMember: true };
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function leaveClass(classId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await classExists(classId)))
      return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);

    if (!rank) return { error: "You are not a member of this class." };
    if (rank === "owner")
      return { error: "You cannot leave as the class owner." };

    await db
      .delete(userClasses)
      .where(
        and(
          eq(userClasses.classId, classId),
          eq(userClasses.userId, session.user.id),
        ),
      );

    logActivity(classId, session.user.id, { action: "member_left" });
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteClass(classId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await classExists(classId)))
      return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      "owner",
      "delete this class",
    );
    if ("error" in allowed) return allowed;

    await db.delete(classes).where(eq(classes.id, classId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function kickFromClass(classId: string, userId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  if (userId === session.user.id) return { error: "You cannot kick yourself." };

  try {
    const cls = await db
      .select({ minRankKickUsers: classes.minRankKickUsers })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankKickUsers,
      "kick this user",
    );
    if ("error" in allowed) return allowed;
    const rankSubjecter = allowed.rank;

    const rankSubject = await getUserRank(classId, userId);
    if (!rankSubject)
      return { error: "The user you are trying to kick is not in the class." };
    if (RANK_VALUE[rankSubject] >= RANK_VALUE[rankSubjecter])
      return { error: "Your rank is not high enough to kick this user." };

    const [targetName] = await Promise.all([
      getUserName(userId),
      db
        .delete(userClasses)
        .where(
          and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
        ),
    ]);

    logActivity(classId, session.user.id, {
      action: "member_kicked",
      target: { id: userId, name: targetName },
    });
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function banFromClass(
  classId: string,
  userId: string,
  reason?: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  if (userId === session.user.id) return { error: "You cannot ban yourself." };

  try {
    const cls = await db
      .select({ minRankBanUsers: classes.minRankBanUsers })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankBanUsers,
      "ban this user",
    );
    if ("error" in allowed) return allowed;
    const rankSubjecter = allowed.rank;

    const rankSubject = await getUserRank(classId, userId);
    if (!rankSubject)
      return { error: "The user you are trying to ban is not in the class." };
    if (RANK_VALUE[rankSubject] >= RANK_VALUE[rankSubjecter])
      return { error: "Your rank is not high enough to ban this user." };

    const [targetName] = await Promise.all([
      getUserName(userId),
      db.transaction(async (tx) => {
        await tx
          .delete(userClasses)
          .where(
            and(
              eq(userClasses.classId, classId),
              eq(userClasses.userId, userId),
            ),
          );
        await tx.insert(classBans).values({
          id: crypto.randomUUID(),
          classId,
          bannedUserId: userId,
          bannedByUserId: session.user.id,
          reason: reason ?? null,
        });
      }),
    ]);

    logActivity(classId, session.user.id, {
      action: "member_banned",
      target: { id: userId, name: targetName },
    });
    return { success: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "This user is already banned." };
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function unbanFromClass(classId: string, userId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  if (userId === session.user.id)
    return { error: "You cannot unban yourself." };

  try {
    const cls = await db
      .select({ minRankBanUsers: classes.minRankBanUsers })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankBanUsers,
      "unban this user",
    );
    if ("error" in allowed) return allowed;

    const isBanned = await db
      .select({ id: classBans.id })
      .from(classBans)
      .where(
        and(eq(classBans.classId, classId), eq(classBans.bannedUserId, userId)),
      )
      .limit(1);
    if (!isBanned[0]) return { error: "This user is not banned." };

    const [targetName] = await Promise.all([
      getUserName(userId),
      db
        .delete(classBans)
        .where(
          and(
            eq(classBans.classId, classId),
            eq(classBans.bannedUserId, userId),
          ),
        ),
    ]);

    logActivity(classId, session.user.id, {
      action: "member_unbanned",
      target: { id: userId, name: targetName },
    });
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function changeUserRank(
  classId: string,
  userId: string,
  newRank: Rank,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  if (userId === session.user.id)
    return { error: "You cannot rerank yourself." };

  try {
    const cls = await db
      .select({ minRankChangeRanks: classes.minRankChangeRanks })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankChangeRanks,
      "change this user's rank",
    );
    if ("error" in allowed) return allowed;
    const rankSubjecter = allowed.rank;

    const rankSubject = await getUserRank(classId, userId);
    if (!rankSubject)
      return {
        error: "The user you are trying to rerank is not in the class.",
      };
    if (RANK_VALUE[rankSubject] >= RANK_VALUE[rankSubjecter])
      return { error: "Your rank is not high enough to rerank this user." };

    if (RANK_VALUE[newRank] >= RANK_VALUE[rankSubjecter])
      return { error: "You can only rerank someone to a rank below yours." };

    const [targetName] = await Promise.all([
      getUserName(userId),
      db
        .update(userClasses)
        .set({ rank: newRank })
        .where(
          and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
        ),
    ]);

    logActivity(classId, session.user.id, {
      action: "rank_changed",
      target: { id: userId, name: targetName },
      rank: newRank,
    });
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function updateClassSettings(
  classId: string,
  settings: ClassSettings,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  if (Object.keys(settings).length === 0)
    return { error: "No settings provided." };

  if (settings.defaultRank === "owner")
    return { error: "Default rank cannot be set to owner." };

  if (settings.name !== undefined) {
    settings.name = settings.name.trim();
    if (settings.name.length < 3)
      return { error: "Class name must be at least three characters long." };
  }

  try {
    if (!(await classExists(classId)))
      return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      "owner",
      "update class settings",
    );
    if ("error" in allowed) return allowed;

    await db.update(classes).set(settings).where(eq(classes.id, classId));

    logActivity(classId, session.user.id, { action: "settings_changed" });
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function regenerateCode(classId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await classExists(classId)))
      return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      "owner",
      "regenerate the class code",
    );
    if ("error" in allowed) return allowed;

    const newCode = await generateUniqueCode();
    await db
      .update(classes)
      .set({ code: newCode })
      .where(eq(classes.id, classId));

    logActivity(classId, session.user.id, { action: "code_regenerated" });
    return { success: true, code: newCode };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

const LOG_PAGE = 10;

export async function getActivityLog(
  classId: string,
  topicId: string | undefined,
  offset: number,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await classExists(classId)))
      return { error: "Class does not exist." };
    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };

    const rows = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        metadata: activityLogs.metadata,
        topicId: activityLogs.topicId,
        userId: activityLogs.userId,
        createdAt: activityLogs.createdAt,
        userName: user.name,
      })
      .from(activityLogs)
      .leftJoin(user, eq(activityLogs.userId, user.id))
      .where(
        and(
          eq(activityLogs.classId, classId),
          topicId ? eq(activityLogs.topicId, topicId) : undefined,
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(LOG_PAGE + 1)
      .offset(offset);

    const hasMore = rows.length > LOG_PAGE;
    return {
      success: true as const,
      entries: rows.slice(0, LOG_PAGE).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      hasMore,
    };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
