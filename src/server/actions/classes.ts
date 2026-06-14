"use server";

import { db } from "@/server/db";
import { classes, userClasses, classBans } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  return `${rand()}${rand()}${rand()}${rand()}-${rand()}${rand()}${rand()}${rand()}`;
}

export async function createClass(name: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  name = name.trim();
  if (name.length < 3)
    return { error: "Class name must be at least three characters long." };

  let code = generateCode();
  while (
    (
      await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.code, code))
    ).length > 0
  ) {
    code = generateCode();
  }

  const classId = crypto.randomUUID();
  await db.insert(classes).values({ id: classId, name, code });
  await db
    .insert(userClasses)
    .values({ userId: session.user.id, classId, rank: "owner" });

  return { success: true };
}

export async function joinClass(code: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

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
}
