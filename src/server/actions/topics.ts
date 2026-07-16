"use server";

import { db } from "@/server/db";
import { classes, topics } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import {
  getUserRank,
  rateLimit,
  requireRank,
  topicBelongsToClass,
} from "./shared";
import { logActivity } from "@/lib/activity-log";

export async function createTopic(
  classId: string,
  name: string,
): Promise<{ error: string } | { success: true; id: string }> {
  if (!name.trim() || name.trim().length < 3)
    return { error: "Topic name must be at least 3 characters." };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const limit = await rateLimit(session.user.id, "createTopic");
  if (limit) return limit;

  try {
    const cls = await db
      .select({
        minRankCreateTopic: classes.minRankCreateTopic,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankCreateTopic,
      "create new topics",
    );
    if ("error" in allowed) return allowed;

    const id = crypto.randomUUID();
    await db.insert(topics).values({
      id,
      classId,
      name,
      createdBy: session.user.id,
    });

    logActivity(classId, session.user.id, {
      action: "topic_created",
      topic: { id, name },
    });
    return { success: true, id };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteTopic(classId: string, topicId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await topicBelongsToClass(classId, topicId)))
      return { error: "Topic does not exist in this class." };

    const cls = await db
      .select({
        minRankDeleteTopic: classes.minRankDeleteTopic,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankDeleteTopic,
      "delete topics",
    );
    if ("error" in allowed) return allowed;

    const [topicRow] = await db
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);

    await db.delete(topics).where(eq(topics.id, topicId));

    logActivity(classId, session.user.id, {
      action: "topic_deleted",
      topicName: topicRow?.name ?? "",
    });
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function changeTopicName(
  classId: string,
  topicId: string,
  name: string,
) {
  if (!name.trim() || name.trim().length < 3)
    return { error: "Topic name must be at least 3 characters." };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await topicBelongsToClass(classId, topicId)))
      return { error: "Topic does not exist in this class." };

    const cls = await db
      .select({
        minRankCreateTopic: classes.minRankCreateTopic,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls[0].minRankCreateTopic,
      "edit topics",
    );
    if ("error" in allowed) return allowed;

    const [topicRow] = await db
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);

    await db.update(topics).set({ name }).where(eq(topics.id, topicId));

    logActivity(
      classId,
      session.user.id,
      {
        action: "topic_renamed",
        oldName: topicRow?.name ?? "",
        newName: name,
      },
      topicId,
    );
    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function getTopics(classId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };

    return await db
      .select({ id: topics.id, name: topics.name, createdAt: topics.createdAt })
      .from(topics)
      .where(eq(topics.classId, classId));
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
