import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Email verified" };

export default async function VerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  if (from !== "verify") redirect("/home");

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="auth-success">
        <div className="succ-ic">
          <CheckIcon size={30} />
        </div>
        <h1 className="succ-h">Email verified</h1>
        <p className="succ-p">
          Your account is now active. You&apos;re ready to start using Notify.
        </p>
        <Link className="btn btn-primary" href="/home">
          Get started
        </Link>
      </div>
    </div>
  );
}
