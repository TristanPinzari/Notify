import type { Metadata } from "next";
import { ResetPasswordForm } from "./content";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : null} />;
}
