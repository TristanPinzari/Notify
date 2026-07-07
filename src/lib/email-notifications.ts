import { db } from "@/server/db";
import {
  user,
  userClasses,
  classes,
  topics,
  masterDocuments,
  compilationSources,
  contributions,
} from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Resend } from "resend";
import { renderRankChanged, renderMasterDoc, RANK_LABELS } from "@/lib/emails";
import { getBaseUrl } from "@/lib/utils";
import type { ActivityPayload } from "@/lib/activity-log";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Notify <notifications@notifyy.ca>";

export async function triggerEmailNotifications(
  classId: string,
  payload: ActivityPayload,
  topicId?: string | null,
) {
  switch (payload.action) {
    case "rank_changed": {
      const [prefs, targetUser, classRow] = await Promise.all([
        db
          .select({ notifyRankChange: userClasses.notifyRankChange })
          .from(userClasses)
          .where(
            and(
              eq(userClasses.userId, payload.target.id),
              eq(userClasses.classId, classId),
            ),
          )
          .limit(1),
        db
          .select({ email: user.email, name: user.name })
          .from(user)
          .where(eq(user.id, payload.target.id))
          .limit(1),
        db
          .select({ name: classes.name })
          .from(classes)
          .where(eq(classes.id, classId))
          .limit(1),
      ]);

      if (!prefs[0]?.notifyRankChange || !targetUser[0] || !classRow[0]) return;

      await resend.emails.send({
        from: FROM,
        to: targetUser[0].email,
        subject: `You're now a ${RANK_LABELS[payload.rank] ?? payload.rank} in ${classRow[0].name}`,
        html: renderRankChanged({
          className: classRow[0].name,
          oldRank: payload.oldRank,
          newRank: payload.rank,
          url: `${getBaseUrl()}/home/${classId}`,
        }),
      });
      break;
    }

    case "compilation_completed": {
      if (!topicId) return;

      const [topicRow, classRow, recipients, latestDocRows] = await Promise.all([
        db
          .select({ name: topics.name })
          .from(topics)
          .where(eq(topics.id, topicId))
          .limit(1),
        db
          .select({ name: classes.name })
          .from(classes)
          .where(eq(classes.id, classId))
          .limit(1),
        db
          .select({ email: user.email })
          .from(userClasses)
          .innerJoin(user, eq(userClasses.userId, user.id))
          .where(
            and(
              eq(userClasses.classId, classId),
              eq(userClasses.notifyMasterDoc, true),
            ),
          ),
        db
          .select({ id: masterDocuments.id })
          .from(masterDocuments)
          .where(
            and(
              eq(masterDocuments.topicId, topicId),
              eq(masterDocuments.status, "ready"),
            ),
          )
          .orderBy(desc(masterDocuments.createdAt))
          .limit(1),
      ]);

      if (!topicRow[0] || !classRow[0] || recipients.length === 0) return;

      let sourceCount = 0;
      let contributorCount = 0;

      if (latestDocRows[0]) {
        const sourceRows = await db
          .select({
            snapshotUploadedBy: compilationSources.snapshotUploadedBy,
            contributionUploadedBy: contributions.uploadedBy,
          })
          .from(compilationSources)
          .leftJoin(
            contributions,
            eq(compilationSources.contributionId, contributions.id),
          )
          .where(eq(compilationSources.masterDocumentId, latestDocRows[0].id));

        sourceCount = sourceRows.length;
        const contributorIds = new Set(
          sourceRows
            .map((r) => r.contributionUploadedBy ?? r.snapshotUploadedBy)
            .filter(Boolean),
        );
        contributorCount = contributorIds.size;
      }

      const url = `${getBaseUrl()}/home/${classId}/${topicId}`;
      await Promise.all(
        recipients.map((r) =>
          resend.emails.send({
            from: FROM,
            to: r.email,
            subject: `New master document – ${topicRow[0].name}`,
            html: renderMasterDoc({
              className: classRow[0].name,
              topicName: topicRow[0].name,
              sourceCount,
              contributorCount,
              url,
            }),
          }),
        ),
      );
      break;
    }
  }
}
