"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { USERNAME_RE, EMAIL_RE } from "@/lib/validation";

const MailIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);
const LockIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const UserIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const EyeIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.47M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 5.4-1.6M14.1 14.1a3 3 0 0 1-4.2-4.2" />
    <path d="m2 2 20 20" />
  </svg>
);
const WarnIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);
const CheckIcon = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const ArrowIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const BackIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);
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
const MailBigIcon = () => (
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
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);
const ShieldIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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

interface FieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  icon: React.ReactNode;
  error?: string;
  peek?: boolean;
  onPeek?: () => void;
  peekOn?: boolean;
  disablePaste?: boolean;
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
  error,
  peek,
  onPeek,
  peekOn,
  disablePaste,
}: FieldProps) {
  const blockClipboard = disablePaste
    ? (e: React.ClipboardEvent) => e.preventDefault()
    : undefined;
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className={`inwrap${value ? " filled" : ""}${error ? " err" : ""}`}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onPaste={blockClipboard}
          onCopy={blockClipboard}
          onCut={blockClipboard}
        />
        <span className="lead">{icon}</span>
        {peek && (
          <button
            type="button"
            className="peek"
            onClick={onPeek}
            aria-label="Toggle password visibility"
          >
            {peekOn ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <div className="err-msg">
          <WarnIcon />
          {error}
        </div>
      )}
    </div>
  );
}

const features = [
  "Pool every classmate's notes in one place",
  "AI compiles them into one master doc",
  "Grammar-checked and fact-checked",
];

export function AuthForm({ defaultMode }: { defaultMode: "login" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(defaultMode);
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function switchMode(m: "login" | "signup" | "forgot") {
    if (m === mode || loading) return;
    setMode(m);
    setConfirmPassword("");
    setErrors({});
    setFormError("");
    setForgotDone(false);
    setCooldown(0);
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setErrors({ email: "Enter a valid email address." });
      return;
    }
    setLoading(true);

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (error) {
      setFormError(error.message ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    setLoading(false);
    setForgotDone(true);
    setCooldown(30);
  }

  async function resend() {
    if (loading || cooldown > 0) return;
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (!error) setCooldown(30);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (isSignup && !USERNAME_RE.test(name))
      e.name = "3–20 characters, letters, numbers and underscores only.";
    if (!EMAIL_RE.test(email)) e.email = "Enter a valid email address.";
    if (password.length < 8)
      e.password = "Password must be at least 8 characters.";
    if (isSignup && password !== confirmPassword)
      e.confirmPassword = "Passwords do not match.";
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await authClient.signUp.email({
          name: name.trim(),
          email,
          password,
        });
        if (error) {
          setFormError(error.message ?? "Something went wrong.");
          setLoading(false);
        } else {
          setLoading(false);
          setDone(true);
        }
      } else {
        const { error } = await authClient.signIn.email({
          email,
          password,
          rememberMe: remember,
        });
        if (error) {
          setFormError(error.message ?? "Invalid email or password.");
          setLoading(false);
        } else {
          router.push("/home");
        }
      }
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      {/* Brand panel */}
      <div className="brandpane">
        <Link className="home-link" href="/">
          <BackIcon /> Back to home
        </Link>
        {isForgot ? (
          <>
            <div className="brand-mid">
              <div className="lock-badge">
                <LockBigIcon />
              </div>
              <h1 className="brand-h">
                {forgotDone ? (
                  <>
                    Check your inbox.
                    <br />
                    <em>The link&apos;s on its way.</em>
                  </>
                ) : (
                  <>
                    Locked out?
                    <br />
                    <em>Happens to everyone.</em>
                  </>
                )}
              </h1>
              <p className="brand-sub">
                {forgotDone
                  ? "We've sent a one-time reset link. It expires in 30 minutes, so grab it while it's fresh."
                  : "Enter your email and we'll send a secure link to set a new password — your classes stay exactly where you left them."}
              </p>
            </div>
            <StepDots step={forgotDone ? 2 : 1} />
          </>
        ) : (
          <>
            <div className="mt-auto">
              <div className="brand-logo">
                <span className="mk">N</span>otify
              </div>
              <h1 className="brand-h">
                {isSignup ? (
                  <>
                    Study together,
                    <br />
                    <em>not in pieces.</em>
                  </>
                ) : (
                  <>
                    Welcome back to
                    <br />
                    <em>the whole picture.</em>
                  </>
                )}
              </h1>
              <p className="brand-sub">
                {isSignup
                  ? "Create your account and start a class in under a minute. Your first master document is moments away."
                  : "Sign in to pick up where your class left off — every note, compiled into one source of truth."}
              </p>
            </div>
            <div className="brand-feats">
              {features.map((f, i) => (
                <div className="bf" key={i}>
                  <span className="tick">
                    <CheckIcon size={13} />
                  </span>
                  {f}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Form panel */}
      <div className="formpane">
        <div className="card">
          <div className="mobile-logo">
            <div className="brand-logo">
              <span className="mk">N</span>otify
            </div>
            <Link className="home-link" href="/">
              <BackIcon /> Home
            </Link>
          </div>

          {done ? (
            <div className="auth-success">
              <div className="succ-ic">
                <CheckIcon size={30} />
              </div>
              <h2 className="succ-h">
                {isSignup ? "Check your email!" : "Welcome back!"}
              </h2>
              <p className="succ-p">
                {isSignup
                  ? `We sent a verification link to ${email}. Click it to activate your account.`
                  : "Signed in successfully. Taking you to your classes…"}
              </p>
              {isSignup && (
                <p className="succ-note">
                  Didn&apos;t get it? Check your spam folder.
                </p>
              )}
            </div>
          ) : isForgot ? (
            forgotDone ? (
              <>
                <div className="icon-top green">
                  <MailBigIcon />
                </div>
                <h2 className="form-h">Check your inbox</h2>
                <p className="form-sub">
                  We sent a reset link to{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                    {email}
                  </strong>
                  .
                </p>
                <a href="mailto:" className="ghostbtn">
                  <MailBigIcon /> Open email app
                </a>
                <div className="note">
                  <span className="note-icon">
                    <ShieldIcon />
                  </span>
                  <span>
                    The link expires in 30 minutes. If you don&apos;t see it,
                    check your spam folder.
                  </span>
                </div>
                <div className="resend">
                  Didn&apos;t get it?
                  <button onClick={resend} disabled={loading || cooldown > 0}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                  </button>
                </div>
                <button
                  className="forgot"
                  style={{
                    marginTop: 20,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => {
                    setForgotDone(false);
                    setCooldown(0);
                  }}
                >
                  <BackIcon /> Use a different email
                </button>
              </>
            ) : (
              <>
                <div className="icon-top amber">
                  <LockBigIcon />
                </div>
                <h2 className="form-h">Reset your password</h2>
                <p className="form-sub">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
                {formError && (
                  <div className="formerr">
                    <WarnIcon />
                    {formError}
                  </div>
                )}
                <form onSubmit={submitForgot} noValidate>
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    icon={<MailIcon />}
                    error={errors.email}
                  />
                  <button className="submit" type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send reset link <ArrowIcon />
                      </>
                    )}
                  </button>
                </form>
                <div className="note">
                  <span className="note-icon">
                    <ShieldIcon />
                  </span>
                  <span>
                    For security, we don&apos;t confirm whether an account
                    exists for this email.
                  </span>
                </div>
                <button
                  className="forgot"
                  style={{
                    marginTop: 20,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => switchMode("login")}
                >
                  <BackIcon /> Back to sign in
                </button>
              </>
            )
          ) : (
            <>
              <div className="mtabs">
                <button
                  className={`mtab${!isSignup ? " on" : ""}`}
                  onClick={() => switchMode("login")}
                >
                  Log in
                </button>
                <button
                  className={`mtab${isSignup ? " on" : ""}`}
                  onClick={() => switchMode("signup")}
                >
                  Sign up
                </button>
              </div>

              <h2 className="form-h">
                {isSignup ? "Create your account" : "Log in to Notify"}
              </h2>
              <p className="form-sub">
                {isSignup
                  ? "Join your class and start compiling."
                  : "Good to see you again."}
              </p>

              {formError && (
                <div className="formerr">
                  <WarnIcon />
                  {formError}
                </div>
              )}

              <form onSubmit={submit} noValidate>
                {isSignup && (
                  <Field
                    label="Username"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. alex_r"
                    icon={<UserIcon />}
                    error={errors.name}
                  />
                )}
                <Field
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  icon={<MailIcon />}
                  error={errors.email}
                />
                <Field
                  label="Password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    isSignup ? "At least 8 characters" : "Your password"
                  }
                  icon={<LockIcon />}
                  error={errors.password}
                  peek
                  onPeek={() => setShowPw((p) => !p)}
                  peekOn={showPw}
                />
                {isSignup && (
                  <Field
                    label="Confirm password"
                    disablePaste
                    type={showConfirmPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    icon={<LockIcon />}
                    error={errors.confirmPassword}
                    peek
                    onPeek={() => setShowConfirmPw((p) => !p)}
                    peekOn={showConfirmPw}
                  />
                )}

                {!isSignup && (
                  <div className="row-between">
                    <label className="remember">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <span className="chkbox">
                        <CheckIcon size={12} />
                      </span>
                      Remember me
                    </label>
                    <button
                      type="button"
                      className="forgot"
                      onClick={() => switchMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  className={`submit${isSignup ? " mt-1.5" : ""}`}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spin" />
                      {isSignup ? "Creating account…" : "Signing in…"}
                    </>
                  ) : (
                    <>
                      {isSignup ? "Create account" : "Log in"}
                      <ArrowIcon />
                    </>
                  )}
                </button>
              </form>

              {isSignup && (
                <p className="terms">
                  By creating an account you agree to Notify&apos;s{" "}
                  <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
                </p>
              )}

              <div className="switch">
                {isSignup ? "Already have an account?" : "New to Notify?"}
                <button
                  onClick={() => switchMode(isSignup ? "login" : "signup")}
                >
                  {isSignup ? "Log in" : "Create one free"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
