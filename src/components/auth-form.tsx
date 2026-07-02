"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { USERNAME_RE, EMAIL_RE } from "@/lib/validation";
import {
  MailIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowIcon,
  BackIcon,
  CheckIcon,
  InfoIcon as WarnIcon,
} from "@/components/icons";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
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

export function StepDots({ step }: { step: number }) {
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
  const [unverified, setUnverified] = useState(false);
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
    setUnverified(false);
    setForgotDone(false);
    setCooldown(0);
  }

  async function resendVerification() {
    if (loading || cooldown > 0) return;
    setLoading(true);
    const { error } = await authClient.sendVerificationEmail({ email });
    setLoading(false);
    if (error) {
      setFormError(error.message ?? "Something went wrong.");
    } else {
      setCooldown(30);
    }
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

  async function signInWithGoogle() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/home",
    });
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
          const isUnverified =
            error.message?.toLowerCase().includes("email not verified") ??
            false;
          setUnverified(isUnverified);
          setFormError(
            isUnverified
              ? "Your email isn't verified yet."
              : (error.message ?? "Invalid email or password."),
          );
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
                  <strong className="text-(--ink) font-semibold">
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
                  className="forgot mt-5 inline-flex items-center gap-1.25"
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
                  className="forgot mt-5 inline-flex items-center gap-1.25"
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
                  {unverified && (
                    <button
                      type="button"
                      className="btn btn-ghost ml-auto px-2.5 py-0.75 text-[12px]"
                      disabled={loading || cooldown > 0}
                      onClick={resendVerification}
                    >
                      {cooldown > 0 ? `${cooldown}s` : "Resend"}
                    </button>
                  )}
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

              <div className="divider">or</div>
              <button
                className="social-btn"
                type="button"
                onClick={signInWithGoogle}
              >
                <GoogleIcon /> Continue with Google
              </button>

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
