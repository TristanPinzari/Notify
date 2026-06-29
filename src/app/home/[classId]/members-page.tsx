import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  classes,
  classBans,
  userClasses,
  user,
  RANK_VALUE,
  contributions,
  topics,
} from "@/server/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { and, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import MembersView from "@/components/members-view";
import type { MemberRow, BannedRow } from "@/components/members-view";

export async function MembersPageContent({
  classId,
  highlightMembers,
  filterReason,
}: {
  classId: string;
  highlightMembers?: string[];
  filterReason?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const bannedUser = alias(user, "banned_user");
  const bannerUser = alias(user, "banner_user");

  const [[cls], [member], memberRows, bannedRows] = await Promise.all([
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
        contributions: sql<number>`cast(count(distinct ${contributions.id}) as int)`,
      })
      .from(userClasses)
      .innerJoin(user, eq(userClasses.userId, user.id))
      .leftJoin(
        contributions,
        and(
          eq(contributions.uploadedBy, userClasses.userId),
          inArray(
            contributions.topicId,
            db
              .select({ id: topics.id })
              .from(topics)
              .where(eq(topics.classId, classId)),
          ),
        ),
      )
      .where(eq(userClasses.classId, classId))
      .groupBy(
        userClasses.userId,
        user.name,
        user.image,
        userClasses.rank,
        userClasses.joinedAt,
      )
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

  if (!cls) notFound();
  if (!member) redirect("/home");

  const vIdx = RANK_VALUE[member.rank];

  const members: MemberRow[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    image: m.image,
    rank: m.rank,
    joinedAt: m.joinedAt.toISOString(),
    contributions: m.contributions,
  }));

  const banned: BannedRow[] | null =
    vIdx >= RANK_VALUE[cls.minRankBanUsers]
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
      classCode={vIdx >= RANK_VALUE[cls.minRankInvite] ? cls.code : null}
      viewerId={session.user.id}
      viewerRank={member.rank}
      members={members}
      banned={banned}
      canInvite={vIdx >= RANK_VALUE[cls.minRankInvite]}
      canKick={vIdx >= RANK_VALUE[cls.minRankKickUsers]}
      canBan={vIdx >= RANK_VALUE[cls.minRankBanUsers]}
      canChangeRank={vIdx >= RANK_VALUE[cls.minRankChangeRanks]}
      highlightMembers={highlightMembers}
      filterReason={filterReason}
    />
  );
}
