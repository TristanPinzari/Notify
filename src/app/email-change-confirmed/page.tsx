import type { Metadata } from "next";
import { EmailChangeConfirmedContent } from "./content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { error } = await searchParams;
  return { title: error ? "Link expired" : "Email change confirmed" };
}

export default async function EmailChangeConfirmedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, email } = await searchParams;
  return (
    <EmailChangeConfirmedContent
      hasError={!!error}
      newEmail={typeof email === "string" ? email : ""}
    />
  );
}
