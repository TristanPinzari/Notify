"use server";

import { db } from "@/server/db";
import { classes, RANK_VALUE, topics } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { getUserRank } from "./shared";

export async function createTopic(classId: string, name: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const cls = await db
      .select({
        minRankCreateTopic: classes.minRankCreateTopic,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };
    if (RANK_VALUE[cls[0].minRankCreateTopic] > RANK_VALUE[rank])
      return { error: "Your rank is not high enough to create new topics." };

    await db.insert(topics).values({
      id: crypto.randomUUID(),
      classId,
      name,
      createdBy: session.user.id,
    });

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteTopic(classId: string, topicId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const cls = await db
      .select({
        minRankDeleteTopic: classes.minRankDeleteTopic,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };
    if (RANK_VALUE[cls[0].minRankDeleteTopic] > RANK_VALUE[rank])
      return { error: "Your rank is not high enough to delete topics." };

    await db.delete(topics).where(eq(topics.id, topicId));

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const cls = await db
      .select({
        minRankCreateTopic: classes.minRankCreateTopic,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls[0]) return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };
    if (RANK_VALUE[cls[0].minRankCreateTopic] > RANK_VALUE[rank])
      return { error: "Your rank is not high enough to edit topics." };

    await db.update(topics).set({ name }).where(eq(topics.id, topicId));

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
