"use server";

import { db } from "@/server/db";
import { user, classes, userClasses, activityLogs } from "@/server/db/schema";
import type { Rank } from "@/server/db/schema";
import { eq, and, isNull, asc, ne } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";

export type NotifPrefs = {
  notifyRankChange: boolean;
  notifyMasterDoc: boolean;
  notifyDigest: boolean;
  notifyKick: boolean;
  notifyBanned: boolean;
  notifyUnbanned: boolean;
  notifyInvite: boolean;
};

type NotifKey = keyof NotifPrefs;

const NOTIF_KEYS: ReadonlySet<string> = new Set<NotifKey>([
  "notifyRankChange",
  "notifyMasterDoc",
  "notifyDigest",
  "notifyKick",
  "notifyBanned",
  "notifyUnbanned",
  "notifyInvite",
]);

export async function getUserNotifications(): Promise<NotifPrefs | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const rows = await db
    .select({
      notifyRankChange: user.notifyRankChange,
      notifyMasterDoc: user.notifyMasterDoc,
      notifyDigest: user.notifyDigest,
      notifyKick: user.notifyKick,
      notifyBanned: user.notifyBanned,
      notifyUnbanned: user.notifyUnbanned,
      notifyInvite: user.notifyInvite,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateUserNotification(key: NotifKey, value: boolean) {
  if (!NOTIF_KEYS.has(key)) return { error: "Invalid notification key." };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  await db
    .update(user)
    .set({ [key]: value })
    .where(eq(user.id, session.user.id));
  return { success: true };
}

export async function getAccountDeletionPreview(): Promise<{
  willDelete: { id: string; name: string }[];
  willTransfer: { id: string; name: string }[];
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { willDelete: [], willTransfer: [] };
  const userId = session.user.id;
  const candidates = await db
    .select({ id: classes.id, name: classes.name })
    .from(userClasses)
    .innerJoin(classes, eq(userClasses.classId, classes.id))
    .where(
      and(
        eq(userClasses.userId, userId),
        eq(userClasses.rank, "owner"),
        isNull(classes.nextOwnerId),
      ),
    );
  const willDelete: { id: string; name: string }[] = [];
  const willTransfer: { id: string; name: string }[] = [];
  for (const c of candidates) {
    const [other] = await db
      .select({ userId: userClasses.userId })
      .from(userClasses)
      .where(and(eq(userClasses.classId, c.id), ne(userClasses.userId, userId)))
      .limit(1);
    if (other) willTransfer.push(c);
    else willDelete.push(c);
  }
  return { willDelete, willTransfer };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function logOwnershipTransfer(
  tx: Tx,
  classId: string,
  actorId: string,
  newOwnerId: string,
  newOwnerName: string,
  newOwnerOldRank: Rank,
) {
  await tx.insert(activityLogs).values([
    {
      id: crypto.randomUUID(),
      classId,
      topicId: null,
      userId: actorId,
      action: "rank_changed",
      metadata: JSON.stringify({
        target: { id: newOwnerId, name: newOwnerName },
        rank: "owner",
        oldRank: newOwnerOldRank,
      }),
    },
    {
      id: crypto.randomUUID(),
      classId,
      topicId: null,
      userId: actorId,
      action: "member_left",
      metadata: null,
    },
  ]);
}

export async function deleteAccount(
  decisions: { classId: string; transfer: boolean }[] = [],
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const userId = session.user.id;
  const decisionMap = new Map(decisions.map((d) => [d.classId, d.transfer]));
  try {
    await db.transaction(async (tx) => {
      const owned = await tx
        .select({ classId: classes.id, nextOwnerId: classes.nextOwnerId })
        .from(userClasses)
        .innerJoin(classes, eq(userClasses.classId, classes.id))
        .where(
          and(eq(userClasses.userId, userId), eq(userClasses.rank, "owner")),
        );

      // Build the exact set of classes that require a decision (all owned, no designated successor)
      const needsDecision = new Set(
        owned.filter((o) => !o.nextOwnerId).map((o) => o.classId),
      );
      const provided = new Set(decisions.map((d) => d.classId));
      const synced =
        needsDecision.size === provided.size &&
        [...needsDecision].every((id) => provided.has(id));
      if (!synced) throw new Error("OUT_OF_SYNC");

      for (const { classId, nextOwnerId } of owned) {
        // Designated successor — verify they are still a member
        if (nextOwnerId) {
          const [still] = await tx
            .select({
              userId: userClasses.userId,
              rank: userClasses.rank,
              name: user.name,
            })
            .from(userClasses)
            .innerJoin(user, eq(userClasses.userId, user.id))
            .where(
              and(
                eq(userClasses.classId, classId),
                eq(userClasses.userId, nextOwnerId),
              ),
            )
            .limit(1);
          if (!still) throw new Error("OUT_OF_SYNC");
          await tx
            .update(userClasses)
            .set({ rank: "owner" })
            .where(
              and(
                eq(userClasses.classId, classId),
                eq(userClasses.userId, nextOwnerId),
              ),
            );
          await tx
            .update(classes)
            .set({ nextOwnerId: null })
            .where(eq(classes.id, classId));
          await logOwnershipTransfer(
            tx,
            classId,
            userId,
            still.userId,
            still.name,
            still.rank,
          );
          continue;
        }
        // No designated successor — check user's decision
        if (decisionMap.get(classId) === false) {
          const [other] = await tx
            .select({ userId: userClasses.userId })
            .from(userClasses)
            .where(and(eq(userClasses.classId, classId), ne(userClasses.userId, userId)))
            .limit(1);
          if (!other) {
            await tx.delete(classes).where(eq(classes.id, classId));
          }
          await tx
            .insert(activityLogs)
            .values({
              id: crypto.randomUUID(),
              classId,
              topicId: null,
              userId,
              action: "member_left",
              metadata: null,
            });
          continue;
        }
        const [oldest] = await tx
          .select({
            userId: userClasses.userId,
            rank: userClasses.rank,
            name: user.name,
          })
          .from(userClasses)
          .innerJoin(user, eq(userClasses.userId, user.id))
          .where(
            and(
              eq(userClasses.classId, classId),
              ne(userClasses.userId, userId),
            ),
          )
          .orderBy(asc(userClasses.joinedAt))
          .limit(1);
        if (oldest) {
          await tx
            .update(userClasses)
            .set({ rank: "owner" })
            .where(
              and(
                eq(userClasses.classId, classId),
                eq(userClasses.userId, oldest.userId),
              ),
            );
          await logOwnershipTransfer(
            tx,
            classId,
            userId,
            oldest.userId,
            oldest.name,
            oldest.rank,
          );
        } else {
          await tx.delete(classes).where(eq(classes.id, classId));
        }
      }
      await tx.delete(user).where(eq(user.id, userId));
    });
    return { success: true };
  } catch (e) {
    if (e instanceof Error && e.message === "OUT_OF_SYNC") {
      return {
        error: "Your class list is out of date.",
        code: "OUT_OF_SYNC" as const,
      };
    }
    console.error("deleteAccount error:", e);
    return { error: "Something went wrong." };
  }
}
