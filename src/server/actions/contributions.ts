"use server";

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";
import {
  classes,
  contributions,
  CType,
  EMethod,
  PStatus,
  topics,
} from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { requireRank, topicBelongsToClass } from "./shared";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

async function setContributionStatus(contributionId: string, status: PStatus) {
  await db
    .update(contributions)
    .set({
      processingStatus: status,
    })
    .where(eq(contributions.id, contributionId));
}

export async function createContribution(
  classId: string,
  topicId: string,
  data: {
    name: string;
    type: CType;
    extractionMethod: EMethod;
    url?: string;
    file?: File;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    if (!(await topicBelongsToClass(classId, topicId)))
      return { error: "Topic does not exist in this class." };

    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls) return { error: "Class does not exist." };

    const allowed = await requireRank(
      classId,
      session.user.id,
      cls.minRankUploadContribution,
      "upload",
    );
    if ("error" in allowed) return allowed;

    if (!data.file && !data.url)
      return { error: "No file or URL provided." };

    const id = crypto.randomUUID();
    let s3Key;
    if (data.file) {
      const buffer = Buffer.from(await data.file.arrayBuffer());
      const ext = data.file.name.split(".").pop();
      s3Key = `contributions/${topicId}/${id}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: buffer,
          ContentType: data.file.type,
        }),
      );
      // TODO: if the insert below throws, this S3 object is orphaned with
      // no row pointing to it — consider a cleanup/reconciliation pass.
    }

    await db.insert(contributions).values({
      id,
      topicId,
      uploadedBy: session.user.id,
      name: data.name,
      type: data.type,
      extractionMethod: data.extractionMethod,
      url: data.url,
      s3Key,
      processingStatus: "processing",
    });

    // TODO: trigger the Temporal extraction workflow here, passing
    // { contributionId: id, s3Key, url: data.url, extractionMethod: data.extractionMethod }.
    // The workflow is responsible for calling setContributionStatus(id, "ready" | "failed")
    // (and writing `text`) once extraction finishes — no client-facing
    // action should ever set those again.

    return { id };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteContribution(
  classId: string,
  contributionId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const [contribution] = await db
      .select({ uploadedBy: contributions.uploadedBy })
      .from(contributions)
      .innerJoin(topics, eq(contributions.topicId, topics.id))
      .where(
        and(eq(contributions.id, contributionId), eq(topics.classId, classId)),
      )
      .limit(1);
    if (!contribution)
      return { error: "Contribution does not exist in this class." };

    if (contribution.uploadedBy !== session.user.id) {
      const [cls] = await db
        .select({
          minRankDeleteContribution: classes.minRankDeleteContribution,
        })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      if (!cls) return { error: "Class does not exist." };

      const allowed = await requireRank(
        classId,
        session.user.id,
        cls.minRankDeleteContribution,
        "delete contributions",
      );
      if ("error" in allowed) return allowed;
    }

    await db.delete(contributions).where(eq(contributions.id, contributionId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
