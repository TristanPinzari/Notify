import type { Metadata } from "next";
import { db } from "@/server/db";
import { classes, userClasses, user } from "@/server/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import SettingsView from "@/components/settings-view";
import { getUserName } from "@/server/actions/shared";

export const metadata: Metadata = { title: "Settings" };

export default async function ClassSettingsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;

  const [[cls], [member], [ownerRow], [otherMember]] = await Promise.all([
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
      .select({ name: user.name, id: user.id })
      .from(userClasses)
      .innerJoin(user, eq(userClasses.userId, user.id))
      .where(
        and(eq(userClasses.classId, classId), eq(userClasses.rank, "owner")),
      )
      .limit(1),

    db
      .select({ userId: userClasses.userId })
      .from(userClasses)
      .where(
        and(eq(userClasses.classId, classId), ne(userClasses.userId, userId)),
      )
      .limit(1),
  ]);

  if (!cls) notFound();
  if (!member) redirect("/home");

  const nextOwnerName = cls.nextOwnerId
    ? await getUserName(cls.nextOwnerId)
    : null;

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
      viewerRank={member.rank}
      hasOtherMembers={!!otherMember}
    />
  );
}
