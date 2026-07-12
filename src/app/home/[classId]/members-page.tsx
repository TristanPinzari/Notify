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
  masterDocuments,
} from "@/server/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { and, count, eq, inArray, max, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import MembersView from "@/components/members-view";
import type { MemberRow, BannedRow } from "@/components/members-view";

export async function MembersPageContent({
  classId,
  topicId,
  highlightMembers,
  filterReason,
}: {
  classId: string;
  topicId?: string;
  highlightMembers?: string[];
  filterReason?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const bannedUser = alias(user, "banned_user");
  const bannerUser = alias(user, "banner_user");
  const uc2 = alias(userClasses, "uc2");
  const uc3 = alias(userClasses, "uc3");

  const [[cls], [member], memberRows, bannedRows, lastContribRows, lastTopicRows, lastCompileRows, sharedClassRows] = await Promise.all([
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
        email: user.email,
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
          topicId
            ? eq(contributions.topicId, topicId)
            : inArray(
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
        user.email,
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

    db
      .select({ userId: contributions.uploadedBy, lastAt: max(contributions.createdAt) })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .innerJoin(uc3, and(eq(contributions.uploadedBy, uc3.userId), eq(uc3.classId, classId)))
      .where(eq(topics.classId, classId))
      .groupBy(contributions.uploadedBy),

    db
      .select({ userId: topics.createdBy, lastAt: max(topics.createdAt) })
      .from(topics)
      .innerJoin(uc3, and(eq(topics.createdBy, uc3.userId), eq(uc3.classId, classId)))
      .where(eq(topics.classId, classId))
      .groupBy(topics.createdBy),

    db
      .select({ userId: masterDocuments.triggeredBy, lastAt: max(masterDocuments.createdAt) })
      .from(masterDocuments)
      .innerJoin(topics, eq(masterDocuments.topicId, topics.id))
      .innerJoin(uc3, and(eq(masterDocuments.triggeredBy, uc3.userId), eq(uc3.classId, classId)))
      .where(eq(topics.classId, classId))
      .groupBy(masterDocuments.triggeredBy),

    db
      .select({ userId: userClasses.userId, sharedCount: count() })
      .from(userClasses)
      .innerJoin(uc2, and(eq(userClasses.classId, uc2.classId), eq(uc2.userId, session.user.id)))
      .innerJoin(uc3, and(eq(userClasses.userId, uc3.userId), eq(uc3.classId, classId)))
      .groupBy(userClasses.userId),
  ]);

  if (!cls) notFound();
  if (!member) redirect("/home");

  const vIdx = RANK_VALUE[member.rank];
  const canKick = vIdx >= RANK_VALUE[cls.minRankKickUsers];
  const canBan = vIdx >= RANK_VALUE[cls.minRankBanUsers];

  const lastActiveMap = new Map<string, Date>();
  for (const r of [...lastContribRows, ...lastTopicRows, ...lastCompileRows]) {
    if (!r.userId || !r.lastAt) continue;
    const prev = lastActiveMap.get(r.userId);
    if (!prev || r.lastAt > prev) lastActiveMap.set(r.userId, r.lastAt);
  }
  const sharedClassMap = new Map(sharedClassRows.map((r) => [r.userId, r.sharedCount]));

  const members: MemberRow[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    image: m.image,
    email: canKick || canBan ? m.email : null,
    rank: m.rank,
    joinedAt: m.joinedAt.toISOString(),
    contributions: m.contributions,
    lastActive: lastActiveMap.get(m.userId)?.toISOString() ?? null,
    sharedClasses: sharedClassMap.get(m.userId) ?? 0,
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
      topicId={topicId}
      className={cls.name}
      classCode={vIdx >= RANK_VALUE[cls.minRankInvite] ? cls.code : null}
      viewerId={session.user.id}
      viewerRank={member.rank}
      members={members}
      banned={banned}
      canInvite={vIdx >= RANK_VALUE[cls.minRankInvite]}
      canKick={canKick}
      canBan={canBan}
      canChangeRank={vIdx >= RANK_VALUE[cls.minRankChangeRanks]}
      highlightMembers={highlightMembers}
      filterReason={filterReason}
    />
  );
}
