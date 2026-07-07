"use server";

import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";

type NotifKey = "notifyRankChange" | "notifyMasterDoc" | "notifyDigest";

export type NotifPrefs = {
  notifyRankChange: boolean;
  notifyMasterDoc: boolean;
  notifyDigest: boolean;
};

export async function getUserNotifications() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const rows = await db
    .select({
      notifyRankChange: user.notifyRankChange,
      notifyMasterDoc: user.notifyMasterDoc,
      notifyDigest: user.notifyDigest,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateUserNotification(key: NotifKey, value: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  await db.update(user).set({ [key]: value }).where(eq(user.id, session.user.id));
  return { success: true };
}
