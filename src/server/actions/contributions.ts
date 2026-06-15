"use server";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/server/db";
import { classes, contributions, RANK_VALUE, CType, EMethod } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { getUserRank } from "./shared";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

export async function getUploadUrl(
  classId: string,
  topicId: string,
  fileName: string,
  contentType: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls) return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };
    if (RANK_VALUE[cls.minRankUploadContribution] > RANK_VALUE[rank])
      return { error: "Your rank is not high enough to upload." };

    const ext = fileName.split(".").pop();
    const s3Key = `contributions/${topicId}/${crypto.randomUUID()}.${ext}`;

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: 300 },
    );

    return { url, s3Key };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function createContribution(
  classId: string,
  topicId: string,
  data: {
    name: string;
    type: CType;
    extractionMethod: EMethod;
    s3Key?: string;
    url?: string;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const [cls] = await db
      .select({ minRankUploadContribution: classes.minRankUploadContribution })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls) return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };
    if (RANK_VALUE[cls.minRankUploadContribution] > RANK_VALUE[rank])
      return { error: "Your rank is not high enough to upload." };

    const id = crypto.randomUUID();
    await db.insert(contributions).values({
      id,
      topicId,
      uploadedBy: session.user.id,
      name: data.name,
      type: data.type,
      extractionMethod: data.extractionMethod,
      s3Key: data.s3Key,
      url: data.url,
    });

    return { id };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}

export async function deleteContribution(classId: string, contributionId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };

  try {
    const [cls] = await db
      .select({ minRankDeleteContribution: classes.minRankDeleteContribution })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!cls) return { error: "Class does not exist." };

    const rank = await getUserRank(classId, session.user.id);
    if (!rank) return { error: "You are not a member of this class." };
    if (RANK_VALUE[cls.minRankDeleteContribution] > RANK_VALUE[rank])
      return { error: "Your rank is not high enough to delete contributions." };

    await db.delete(contributions).where(eq(contributions.id, contributionId));

    return { success: true };
  } catch (e) {
    console.error("ERROR: ", e);
    return { error: "Something went wrong." };
  }
}
