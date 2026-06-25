import type { Metadata } from "next";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  classes,
  classBans,
  userClasses,
  user,
  RANK_VALUE,
} from "@/server/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import MembersView from "@/components/members-view";
import type { MemberRow, BannedRow } from "@/components/members-view";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
}: {
  params: Promise<{ classId: string; topicId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  const { classId } = await params;

  const bannedUser = alias(user, "banned_user");
  const bannerUser = alias(user, "banner_user");

  const [[cls], [viewer], memberRows, bannedRows] = await Promise.all([
    db
      .select({
        name: classes.name,
        code: classes.code,
        minRankInvite: classes.minRankInvite,
        minRankKickUsers: classes.minRankKickUsers,
        minRankBanUsers: classes.minRankBanUsers,
        minRankChangeRanks: classes.minRankChangeRanks,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1),

    db
      .select({ rank: userClasses.rank })
      .from(userClasses)
      .where(
        and(
          eq(userClasses.classId, classId),
          eq(userClasses.userId, session.user.id),
        ),
      )
      .limit(1),

    db
      .select({
        userId: userClasses.userId,
        name: user.name,
        image: user.image,
        rank: userClasses.rank,
        joinedAt: userClasses.joinedAt,
      })
      .from(userClasses)
      .innerJoin(user, eq(userClasses.userId, user.id))
      .where(eq(userClasses.classId, classId))
      .orderBy(userClasses.joinedAt),

    db
      .select({
        userId: classBans.bannedUserId,
        name: bannedUser.name,
        image: bannedUser.image,
        reason: classBans.reason,
        bannedAt: classBans.createdAt,
        bannedById: classBans.bannedByUserId,
        bannedByName: bannerUser.name,
      })
      .from(classBans)
      .innerJoin(bannedUser, eq(classBans.bannedUserId, bannedUser.id))
      .leftJoin(bannerUser, eq(classBans.bannedByUserId, bannerUser.id))
      .where(eq(classBans.classId, classId))
      .orderBy(classBans.createdAt),
  ]);

  if (!cls || !viewer) notFound();

  const vIdx = RANK_VALUE[viewer.rank];
  const canInvite = vIdx >= RANK_VALUE[cls.minRankInvite];
  const canKick = vIdx >= RANK_VALUE[cls.minRankKickUsers];
  const canBan = vIdx >= RANK_VALUE[cls.minRankBanUsers];
  const canChangeRank = vIdx >= RANK_VALUE[cls.minRankChangeRanks];

  const members: MemberRow[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    image: m.image,
    rank: m.rank,
    joinedAt: m.joinedAt.toISOString(),
  }));

  const banned: BannedRow[] | null = canBan
    ? bannedRows.map((b) => ({
        userId: b.userId,
        name: b.name,
        image: b.image,
        reason: b.reason,
        bannedAt: b.bannedAt.toISOString(),
        bannedById: b.bannedById,
        bannedByName: b.bannedByName,
      }))
    : null;

  return (
    <MembersView
      classId={classId}
      className={cls.name}
      classCode={cls.code}
      viewerId={session.user.id}
      viewerRank={viewer.rank}
      members={members}
      banned={banned}
      canInvite={canInvite}
      canKick={canKick}
      canBan={canBan}
      canChangeRank={canChangeRank}
    />
  );
}
