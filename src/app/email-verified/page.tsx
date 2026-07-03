import type { Metadata } from "next";
import { EmailVerifiedContent } from "./content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { error, type } = await searchParams;
  if (error) return { title: "Link expired" };
  if (type === "email-change") return { title: "New email verified" };
  return { title: "Email verified" };
}

export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, type } = await searchParams;
  return (
    <EmailVerifiedContent
      hasError={!!error}
      isEmailChange={type === "email-change"}
    />
  );
}
