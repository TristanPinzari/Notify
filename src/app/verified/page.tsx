import Link from "next/link";
import { redirect } from "next/navigation";

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
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="succ-h">Email verified</h1>
        <p className="succ-p">Your account is now active. You&apos;re ready to start using Notify.</p>
        <Link className="btn btn-primary" href="/home">Get started</Link>
      </div>
    </div>
  );
}
