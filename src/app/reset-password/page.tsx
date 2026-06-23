"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  BackIcon,
  ArrowIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon as WarnIcon,
  LockIcon,
} from "@/components/icons";

const LockBigIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const CheckBigIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function StepDots({ step }: { step: number }) {
  const items: React.ReactNode[] = [];
  for (let n = 1; n <= 3; n++) {
    items.push(
      <span
        key={`d${n}`}
        className={`sd${step === n ? " active" : ""}${step > n ? " done" : ""}`}
      />,
    );
    if (n < 3) {
      items.push(
        <span key={`s${n}`} className={`seg${step > n ? " done" : ""}`} />,
      );
    }
  }
  return <div className="steps-dots">{items}</div>;
}

function ResetPasswordForm() {
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirm?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const step = done ? 4 : 3;

  useEffect(() => {
    document.title = "Reset password — Notify";
  }, []);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};
    if (password.length < 8)
      errs.password = "Password must be at least 8 characters.";
    if (password !== confirmPassword) errs.confirm = "Passwords do not match.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setError("");
    const { error: err } = await authClient.resetPassword({
      newPassword: password,
      token: token!,
    });
    setLoading(false);

    if (err) {
      setError(
        err.message ?? "Something went wrong. The link may have expired.",
      );
      return;
    }
    setDone(true);
  }

  return (
    <div className="auth">
      {/* Brand panel */}
      <div className="brandpane">
        <Link className="home-link" href="/sign-in">
          <BackIcon /> Back to sign in
        </Link>
        <div className="brand-mid">
          <div className="lock-badge">
            <LockBigIcon />
          </div>
          <h1 className="brand-h">
            {done ? (
              <>
                All set.
                <br />
                <em>Back to studying.</em>
              </>
            ) : (
              <>
                One new password
                <br />
                <em>and you&apos;re back in.</em>
              </>
            )}
          </h1>
          <p className="brand-sub">
            {done
              ? "Your password's updated. Everything in your classes is right where you left them."
              : "Choose something strong and memorable. You'll use it next time you log in to Notify."}
          </p>
        </div>
        <StepDots step={step} />
      </div>

      {/* Form panel */}
      <div className="formpane">
        <div className="card">
          <div className="mobile-logo">
            <div className="brand-logo">
              <span className="mk">N</span>otify
            </div>
            <Link className="home-link" href="/sign-in">
              <BackIcon /> Sign in
            </Link>
          </div>

          {!token ? (
            <>
              <div
                className="icon-top amber"
                style={{
                  background: "var(--danger-bg)",
                  color: "var(--danger)",
                  borderColor: "rgba(180,69,47,0.2)",
                }}
              >
                <WarnIcon />
              </div>
              <h2 className="form-h">Invalid link</h2>
              <p className="form-sub" style={{ marginBottom: 24 }}>
                This password reset link is missing or invalid. Please request a
                new one.
              </p>
              <Link
                href="/sign-in"
                className="submit"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  textDecoration: "none",
                }}
              >
                Back to sign in <ArrowIcon />
              </Link>
            </>
          ) : done ? (
            <>
              <div className="icon-top green">
                <CheckBigIcon />
              </div>
              <h2 className="form-h">Password updated!</h2>
              <p className="form-sub" style={{ marginBottom: 24 }}>
                Your new password is set. You can now sign in.
              </p>
              <Link
                href="/sign-in"
                className="submit"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  textDecoration: "none",
                }}
              >
                Sign in <ArrowIcon />
              </Link>
            </>
          ) : (
            <>
              <div className="icon-top amber">
                <LockBigIcon />
              </div>
              <h2 className="form-h">Set a new password</h2>
              <p className="form-sub">
                Choose something you haven&apos;t used before.
              </p>

              {error && (
                <div className="formerr">
                  <WarnIcon />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label className="label">New password</label>
                  <div
                    className={`inwrap${password ? " filled" : ""}${fieldErrors.password ? " err" : ""}`}
                  >
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoFocus
                    />
                    <span className="lead">
                      <LockIcon />
                    </span>
                    <button
                      type="button"
                      className="peek"
                      onClick={() => setShowPw((p) => !p)}
                      aria-label="Toggle visibility"
                    >
                      {showPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <div className="err-msg">
                      <WarnIcon />
                      {fieldErrors.password}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label className="label">Confirm password</label>
                  <div
                    className={`inwrap${confirmPassword ? " filled" : ""}${fieldErrors.confirm ? " err" : ""}`}
                  >
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      onPaste={(e) => e.preventDefault()}
                    />
                    <span className="lead">
                      <LockIcon />
                    </span>
                    <button
                      type="button"
                      className="peek"
                      onClick={() => setShowConfirmPw((p) => !p)}
                      aria-label="Toggle visibility"
                    >
                      {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {fieldErrors.confirm && (
                    <div className="err-msg">
                      <WarnIcon />
                      {fieldErrors.confirm}
                    </div>
                  )}
                </div>

                <button className="submit" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spin" />
                      Updating…
                    </>
                  ) : (
                    <>
                      Reset password <ArrowIcon />
                    </>
                  )}
                </button>
              </form>

              <Link
                href="/sign-in"
                className="forgot"
                style={{
                  marginTop: 20,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <BackIcon /> Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
