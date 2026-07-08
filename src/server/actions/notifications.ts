"use server";

import { db } from "@/server/db";
import { notifications, userClasses, classes } from "@/server/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";

export type NotificationRow = {
  id: string;
  type: string;
  payload: string;
  readAt: Date | null;
  createdAt: Date | string;
  classId: string | null;
};

export async function getNotifications(): Promise<NotificationRow[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      classId: notifications.classId,
    })
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
}

export type ClassNotifPrefs = {
  notifyRankChange: boolean;
  notifyMasterDoc: boolean;
  notifyDigest: boolean;
};

export async function getClassNotifPrefs(
  classId: string,
): Promise<(ClassNotifPrefs & { className: string }) | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const rows = await db
    .select({
      notifyRankChange: userClasses.notifyRankChange,
      notifyMasterDoc: userClasses.notifyMasterDoc,
      notifyDigest: userClasses.notifyDigest,
      className: classes.name,
    })
    .from(userClasses)
    .innerJoin(classes, eq(classes.id, classId))
    .where(and(eq(userClasses.classId, classId), eq(userClasses.userId, session.user.id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function markNotificationsRead(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt),
      ),
    );
}
