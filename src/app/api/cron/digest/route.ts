import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { user, userClasses, classes, activityLogs } from "@/server/db/schema";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { getResend } from "@/lib/resend";
import { renderDigest } from "@/lib/emails";
import type { ClassDigest } from "@/lib/emails";
import { MEMBER_LOSS_ACTIONS } from "@/lib/activity-log";

const FROM = "Notify <notifications@notifyy.ca>";
const BATCH_SIZE = 100;

const activityTotal = (c: ClassDigest) =>
  c.contributions + c.compilations + c.topics + c.membersJoined + c.membersLost;

export async function GET(req: NextRequest) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const subscriptions = await db
    .select({
      userId: userClasses.userId,
      email: user.email,
      classId: userClasses.classId,
      className: classes.name,
    })
    .from(userClasses)
    .innerJoin(user, eq(userClasses.userId, user.id))
    .innerJoin(classes, eq(userClasses.classId, classes.id))
    .where(eq(userClasses.notifyDigest, true));

  if (subscriptions.length === 0) return Response.json({ sent: 0 });

  const classIds = [...new Set(subscriptions.map((s) => s.classId))];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [statsRows, memberEvents] = await Promise.all([
    db
      .select({
        classId: activityLogs.classId,
        contributions: sql<number>`COUNT(CASE WHEN ${activityLogs.action} = 'contribution_uploaded' THEN 1 END)::int`,
        compilations: sql<number>`COUNT(CASE WHEN ${activityLogs.action} = 'compilation_completed' THEN 1 END)::int`,
        topics: sql<number>`COUNT(CASE WHEN ${activityLogs.action} = 'topic_created' THEN 1 END)::int`,
      })
      .from(activityLogs)
      .where(
        and(
          inArray(activityLogs.classId, classIds),
          gte(activityLogs.createdAt, since),
        ),
      )
      .groupBy(activityLogs.classId),

    db
      .select({
        classId: activityLogs.classId,
        userId: activityLogs.userId,
        action: activityLogs.action,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(
        and(
          inArray(activityLogs.classId, classIds),
          gte(activityLogs.createdAt, since),
          inArray(activityLogs.action, [
            "member_joined",
            ...MEMBER_LOSS_ACTIONS,
          ]),
        ),
      ),
  ]);

  // For each (classId, userId), keep only the last action chronologically
  const lastAction = new Map<
    string,
    { classId: string; action: string; createdAt: Date }
  >();
  for (const e of memberEvents) {
    if (!e.userId) continue;
    const key = `${e.classId}:${e.userId}`;
    const existing = lastAction.get(key);
    if (!existing || e.createdAt > existing.createdAt) {
      lastAction.set(key, {
        classId: e.classId,
        action: e.action,
        createdAt: e.createdAt,
      });
    }
  }

  const memberStats = new Map<
    string,
    { membersJoined: number; membersLost: number }
  >();
  for (const { classId, action } of lastAction.values()) {
    const s = memberStats.get(classId) ?? { membersJoined: 0, membersLost: 0 };
    if (action === "member_joined") s.membersJoined++;
    else s.membersLost++;
    memberStats.set(classId, s);
  }

  const statsMap = new Map(statsRows.map((s) => [s.classId, s]));

  const byUser = new Map<
    string,
    { email: string; activeClasses: ClassDigest[] }
  >();

  for (const sub of subscriptions) {
    const stat = statsMap.get(sub.classId);
    const members = memberStats.get(sub.classId) ?? {
      membersJoined: 0,
      membersLost: 0,
    };
    const digest: ClassDigest = {
      name: sub.className,
      classId: sub.classId,
      contributions: stat?.contributions ?? 0,
      compilations: stat?.compilations ?? 0,
      topics: stat?.topics ?? 0,
      membersJoined: members.membersJoined,
      membersLost: members.membersLost,
    };
    if (activityTotal(digest) === 0) continue;

    if (!byUser.has(sub.userId)) {
      byUser.set(sub.userId, { email: sub.email, activeClasses: [] });
    }
    byUser.get(sub.userId)!.activeClasses.push(digest);
  }

  if (byUser.size === 0) return Response.json({ sent: 0 });

  const emails: { from: string; to: string; subject: string; html: string }[] =
    [];

  for (const { email, activeClasses } of byUser.values()) {
    activeClasses.sort((a, b) => activityTotal(b) - activityTotal(a));
    emails.push({
      from: FROM,
      to: email,
      subject: "Your weekly Notify digest",
      html: renderDigest({ classes: activeClasses }),
    });
  }

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    await getResend().batch.send(emails.slice(i, i + BATCH_SIZE));
  }

  return Response.json({ sent: emails.length });
}
