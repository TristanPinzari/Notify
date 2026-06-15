"use server";

import { db } from "@/server/db";
import {
  classes,
  userClasses,
  classBans,
  Rank,
  ClassSettings,
  RANK_VALUE,
} from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { getUserRank } from "./shared";

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

    return { success: true };
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
      .select()
      .from(classes)
      .where(eq(classes.code, code))
      .limit(1);
    if (!cls[0]) return { error: "Class not found." };

    const banned = await db
      .select({ reason: classBans.reason })
      .from(classBans)
      .where(
        and(
          eq(classBans.classId, cls[0].id),
          eq(classBans.bannedUserId, session.user.id),
        ),
      )
      .limit(1);

    if (banned.length > 0)
      return { error: "Banned from this class.", reason: banned[0].reason };

    const member = await db
      .select({ userId: userClasses.userId })
      .from(userClasses)
      .where(
        and(
          eq(userClasses.classId, cls[0].id),
          eq(userClasses.userId, session.user.id),
        ),
      )
      .limit(1);

    if (member.length > 0) return { error: "You are already a member." };

    await db.insert(userClasses).values({
      userId: session.user.id,
      classId: cls[0].id,
      rank: cls[0].defaultRank,
    });

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function leaveClass(classId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const membership = await getUserRank(classId, session.user.id);

    if (!membership) return { error: "You are not a member of this class." };
    if (membership === "owner")
      return { error: "You cannot leave as the class owner." };

    await db
      .delete(userClasses)
      .where(
        and(
          eq(userClasses.classId, classId),
          eq(userClasses.userId, session.user.id),
        ),
      );

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
    const membership = await getUserRank(classId, session.user.id);

    if (!membership) return { error: "You are not a member of this class." };
    if (membership !== "owner")
      return { error: "You are not the owner of this class." };

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

    const membershipSubjecter = await getUserRank(classId, session.user.id);
    if (!membershipSubjecter)
      return { error: "You are not a member of this class." };

    if (RANK_VALUE[cls[0].minRankKickUsers] > RANK_VALUE[membershipSubjecter])
      return { error: "Your rank is not high enough to kick this user." };

    const membershipSubject = await getUserRank(classId, userId);
    if (!membershipSubject)
      return { error: "The user you are trying to kick is not in the class." };
    if (RANK_VALUE[membershipSubject] >= RANK_VALUE[membershipSubjecter])
      return { error: "Your rank is not high enough to kick this user." };

    await db
      .delete(userClasses)
      .where(
        and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
      );
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function banFromClass(classId: string, userId: string) {
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

    const membershipSubjecter = await getUserRank(classId, session.user.id);
    if (!membershipSubjecter)
      return { error: "You are not a member of this class." };

    if (RANK_VALUE[cls[0].minRankBanUsers] > RANK_VALUE[membershipSubjecter])
      return { error: "Your rank is not high enough to ban this user." };

    const membershipSubject = await getUserRank(classId, userId);
    if (!membershipSubject)
      return { error: "The user you are trying to ban is not in the class." };
    if (RANK_VALUE[membershipSubject] >= RANK_VALUE[membershipSubjecter])
      return { error: "Your rank is not high enough to ban this user." };

    await db.transaction(async (tx) => {
      await tx
        .delete(userClasses)
        .where(
          and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
        );
      await tx.insert(classBans).values({
        id: crypto.randomUUID(),
        classId,
        bannedUserId: userId,
        bannedByUserId: session.user.id,
      });
    });

    return { success: true };
  } catch (e) {
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
      .select({
        minRankBanUsers: classes.minRankBanUsers,
        defaultRank: classes.defaultRank,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const membershipSubjecter = await getUserRank(classId, session.user.id);
    if (!membershipSubjecter)
      return { error: "You are not a member of this class." };

    if (RANK_VALUE[cls[0].minRankBanUsers] > RANK_VALUE[membershipSubjecter])
      return {
        error: "Your rank is not high enough to unban this user.",
      };

    const isBanned = await db
      .select({ id: classBans.id })
      .from(classBans)
      .where(
        and(eq(classBans.classId, classId), eq(classBans.bannedUserId, userId)),
      )
      .limit(1);
    if (!isBanned[0]) return { error: "This user is not banned." };

    await db
      .delete(classBans)
      .where(
        and(eq(classBans.classId, classId), eq(classBans.bannedUserId, userId)),
      );

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

    const membershipSubjecter = await getUserRank(classId, session.user.id);
    if (!membershipSubjecter)
      return { error: "You are not a member of this class." };

    if (RANK_VALUE[cls[0].minRankChangeRanks] > RANK_VALUE[membershipSubjecter])
      return {
        error: "Your rank is not high enough to change this user's rank.",
      };

    const membershipSubject = await getUserRank(classId, userId);
    if (!membershipSubject)
      return {
        error: "The user you are trying to rerank is not in the class.",
      };
    if (RANK_VALUE[membershipSubject] >= RANK_VALUE[membershipSubjecter])
      return { error: "Your rank is not high enough to rerank this user." };

    if (RANK_VALUE[newRank] >= RANK_VALUE[membershipSubjecter])
      return { error: "You can only rerank someone to a rank below yours." };

    await db
      .update(userClasses)
      .set({ rank: newRank })
      .where(
        and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
      );

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

  try {
    const cls = await db
      .select({
        classId: classes.id,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const membership = await getUserRank(classId, session.user.id);
    if (!membership) return { error: "You are not a member of this class." };
    if (membership !== "owner")
      return { error: "You are not the owner of this class." };

    await db.update(classes).set(settings).where(eq(classes.id, classId));

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
    const cls = await db
      .select({
        classId: classes.id,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const membership = await getUserRank(classId, session.user.id);
    if (!membership) return { error: "You are not a member of this class." };
    if (membership !== "owner")
      return { error: "You are not the owner of this class." };

    await db
      .update(classes)
      .set({ code: await generateUniqueCode() })
      .where(eq(classes.id, classId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
