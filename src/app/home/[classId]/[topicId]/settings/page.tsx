import type { Metadata } from "next";
import { db } from "@/server/db";
import {
  classes,
  userClasses,
  user,
  topics,
  RANK_VALUE,
} from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import SettingsView from "@/components/settings-view";
import { getUserName } from "@/server/actions/shared";

export const metadata: Metadata = { title: "Settings" };

export default async function TopicSettingsPage({
  params,
}: {
  params: Promise<{ classId: string; topicId: string }>;
}) {
  const { classId, topicId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;

  const [[cls], [member], [topicRow], [ownerRow]] = await Promise.all([
    db
      .select({
        id: classes.id,
        name: classes.name,
        code: classes.code,
        createdAt: classes.createdAt,
        defaultRank: classes.defaultRank,
        minRankCreateTopic: classes.minRankCreateTopic,
        minRankDeleteTopic: classes.minRankDeleteTopic,
        minRankUploadContribution: classes.minRankUploadContribution,
        minRankDeleteContribution: classes.minRankDeleteContribution,
        minRankTriggerCompilation: classes.minRankTriggerCompilation,
        minRankEditCompilation: classes.minRankEditCompilation,
        minRankInvite: classes.minRankInvite,
        minRankBanUsers: classes.minRankBanUsers,
        minRankKickUsers: classes.minRankKickUsers,
        minRankChangeRanks: classes.minRankChangeRanks,
        minRankPinContribution: classes.minRankPinContribution,
        nextOwnerId: classes.nextOwnerId,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1),

    db
      .select({ rank: userClasses.rank })
      .from(userClasses)
      .where(
        and(eq(userClasses.classId, classId), eq(userClasses.userId, userId)),
      )
      .limit(1),

    db
      .select({
        id: topics.id,
        name: topics.name,
        createdAt: topics.createdAt,
        createdBy: topics.createdBy,
        creatorName: user.name,
      })
      .from(topics)
      .leftJoin(user, eq(topics.createdBy, user.id))
      .where(and(eq(topics.id, topicId), eq(topics.classId, classId)))
      .limit(1),

    db
      .select({ name: user.name, id: user.id })
      .from(userClasses)
      .innerJoin(user, eq(userClasses.userId, user.id))
      .where(and(eq(userClasses.classId, classId), eq(userClasses.rank, "owner")))
      .limit(1),
  ]);

  if (!cls) notFound();
  if (!member) redirect("/home");
  if (!topicRow) notFound();

  const nextOwnerName = cls.nextOwnerId ? await getUserName(cls.nextOwnerId) : null;

  const canDelete =
    RANK_VALUE[member.rank] >= RANK_VALUE[cls.minRankDeleteTopic];
  const canRename =
    topicRow.createdBy === userId ||
    RANK_VALUE[member.rank] >= RANK_VALUE[cls.minRankCreateTopic];

  return (
    <SettingsView
      classId={classId}
      cls={{
        ...cls,
        createdAt: cls.createdAt.toISOString(),
        ownerName: ownerRow?.name ?? "Unknown",
        ownerId: ownerRow?.id ?? "",
        code: member.rank === "owner" ? cls.code : null,
        nextOwnerId: cls.nextOwnerId,
        nextOwnerName,
      }}
      topic={{
        id: topicRow.id,
        name: topicRow.name,
        createdAt: topicRow.createdAt.toISOString(),
        createdByName: topicRow.creatorName ?? "Deleted user",
        createdById: topicRow.createdBy ?? "",
        createdByMe: topicRow.createdBy === userId,
        canDelete,
        canRename,
      }}
      viewerRank={member.rank}
    />
  );
}
