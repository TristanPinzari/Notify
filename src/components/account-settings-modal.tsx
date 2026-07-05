"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { initials, avatarColor } from "@/lib/format";
import { resizeImage } from "@/lib/image";
import { getAvatarUploadUrl } from "@/server/actions/avatar";
import {
  LockIcon,
  BellIcon,
  SettingsIcon,
  LogOutIcon,
  XIcon,
  UserIcon,
  CheckIcon,
  UploadIcon,
} from "@/components/icons";

type Tab = "profile" | "security" | "notifications" | "preferences";
type User = { name: string; email: string; image?: string | null };
type Props = { user: User; onClose: () => void };

/* ── Avatar ─────────────────────────────────────────────────────── */
function ModalAvatar({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string;
  size: 40 | 68;
}) {
  const tw = size === 68 ? "w-17 h-17 text-[24px]" : "w-10 h-10 text-[15px]";
  return (
    <div
      className={`${tw} rounded-full shrink-0 overflow-hidden flex items-center justify-center font-semibold text-white`}
      style={src ? undefined : { background: avatarColor(name) }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

/* ── Toggle ─────────────────────────────────────────────────────── */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-block w-9 h-5.25 shrink-0 cursor-pointer">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="absolute inset-0 rounded-full bg-(--line-strong) transition-colors duration-150 peer-checked:bg-(--accent) after:absolute after:left-0.75 after:top-0.75 after:h-3.75 after:w-3.75 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-150 after:content-[''] peer-checked:after:translate-x-3.75" />
    </label>
  );
}

/* ── Row ─────────────────────────────────────────────────────────── */
function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-(--line-soft) last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-(--ink-heading)">
          {title}
        </div>
        <div className="text-[11.5px] text-(--ink-faint) mt-0.5 leading-snug">
          {desc}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Profile panel ──────────────────────────────────────────────── */
function ProfilePanel({
  name: initialName,
  email: initialEmail,
  image: initialImage,
  onNameSaved,
  onImageSaved,
}: {
  name: string;
  email: string;
  image?: string | null;
  onNameSaved: (n: string) => void;
  onImageSaved: (url: string | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const trimmedName = name.trim();
  const nameDirty = trimmedName !== initialName && trimmedName.length > 0;

  const [emailInput, setEmailInput] = useState(initialEmail);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const emailDirty =
    emailInput.trim() !== initialEmail && emailInput.trim().length > 0;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialImage ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    setSaving(true);
    const res = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message ?? "Failed to update profile.");
      return;
    }
    onNameSaved(name.trim());
    router.refresh();
    toast.success("Profile updated.");
  }

  async function sendEmailChange() {
    setEmailSending(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (authClient as any).changeEmail({
      newEmail: emailInput.trim(),
      callbackURL: `/email-change-confirmed?email=${encodeURIComponent(emailInput.trim())}`,
    });
    setEmailSending(false);
    if (res?.error) {
      toast.error(res.error.message ?? "Failed to send verification email.");
      return;
    }
    setEmailSent(true);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const [blob, result] = await Promise.all([
        resizeImage(file),
        getAvatarUploadUrl(),
      ]);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const uploadRes = await fetch(result.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/webp" },
      });
      if (!uploadRes.ok) {
        toast.error("Upload failed.");
        return;
      }
      const publicUrl = `${result.publicUrl}?v=${Date.now()}`;
      await authClient.updateUser({ image: publicUrl });
      setAvatarUrl(publicUrl);
      onImageSaved(publicUrl);
      router.refresh();
      toast.success("Photo updated.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    const res = await authClient.updateUser({ image: null });
    if (res.error) {
      toast.error(res.error.message ?? "Failed to remove photo.");
      return;
    }
    setAvatarUrl(null);
    onImageSaved(null);
    router.refresh();
    toast.success("Photo removed.");
  }

  return (
    <>
      {/* avatar row */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />
      <div className="flex items-center gap-4 mb-5">
        <ModalAvatar src={avatarUrl} name={name || initialName} size={68} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <span className="mini-spin" /> Uploading…
                </>
              ) : (
                <>
                  <UploadIcon /> Upload photo
                </>
              )}
            </button>
            {avatarUrl && (
              <button
                className="forgot"
                onClick={removeAvatar}
                disabled={uploading}
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-[11.5px] text-(--ink-faint)">
            JPG, PNG, or WebP. Cropped to a square.
          </span>
        </div>
      </div>

      {/* display name */}
      <div className="field">
        <label className="label">Display name</label>
        <div className={`inwrap no-icon${name ? " filled" : ""}`}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        {nameDirty ? (
          <div className="flex items-center gap-2.5 mt-2">
            <button
              className="forgot"
              onClick={() => setName(initialName)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm ml-auto"
              onClick={saveName}
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="mini-spin" /> Saving…
                </>
              ) : (
                <>
                  <CheckIcon size={14} /> Save
                </>
              )}
            </button>
          </div>
        ) : (
          <span className="block text-[11.5px] text-(--ink-faint) mt-1.5">
            Shown on your contributions and in member lists.
          </span>
        )}
      </div>

      {/* email */}
      <div className="field">
        <label className="label">Email</label>
        {emailSent ? (
          <div className="flex items-start gap-2.5 bg-(--accent-soft) border border-[rgba(196,121,24,0.2)] rounded-[10px] px-3.5 py-3 text-[12.5px] text-(--accent-text) leading-snug">
            <span className="mt-px shrink-0">
              <CheckIcon size={14} />
            </span>
            <span>
              Verification link sent to <strong>{emailInput.trim()}</strong>.
              Click it to complete the change.
            </span>
          </div>
        ) : (
          <>
            <div className={`inwrap no-icon${emailInput ? " filled" : ""}`}>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
            {emailDirty && (
              <div className="flex items-center gap-2.5 mt-2">
                <button
                  className="forgot"
                  onClick={() => setEmailInput(initialEmail)}
                  disabled={emailSending}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm ml-auto"
                  onClick={sendEmailChange}
                  disabled={emailSending}
                >
                  {emailSending ? (
                    <>
                      <span className="mini-spin" /> Sending…
                    </>
                  ) : (
                    "Send verification"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Security panel ─────────────────────────────────────────────── */
function SecurityPanel({ email }: { email: string }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const ready = cur.length > 0 && nw.length >= 8 && nw === cf;

  async function save() {
    setSaving(true);
    const res = await authClient.changePassword({
      currentPassword: cur,
      newPassword: nw,
      revokeOtherSessions: false,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message ?? "Failed to update password.");
      return;
    }
    setCur("");
    setNw("");
    setCf("");
    toast.success("Password updated.");
  }

  async function sendReset() {
    setResetLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setResetLoading(false);
    if (error) {
      toast.error(error.message ?? "Failed to send reset link.");
      return;
    }
    setResetSent(true);
  }

  async function signOutOthers() {
    setSigningOut(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (authClient as any).revokeOtherSessions();
    setSigningOut(false);
    if (res?.error) {
      toast.error("Failed to sign out other sessions.");
      return;
    }
    toast.success("Signed out of all other devices.");
  }

  return (
    <>
      <p className="text-[12.5px] text-(--ink-faint) leading-relaxed mb-4">
        Choose a strong password you don&apos;t use elsewhere. Minimum 8
        characters.
      </p>
      <div className="field">
        <label className="label">Current password</label>
        <div className={`inwrap no-icon${cur ? " filled" : ""}`}>
          <input
            type="password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
      </div>
      <div className="field">
        <label className="label">New password</label>
        <div className={`inwrap no-icon${nw ? " filled" : ""}`}>
          <input
            type="password"
            value={nw}
            onChange={(e) => setNw(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </div>
      </div>
      <div className="field">
        <label className="label">Confirm new password</label>
        <div className={`inwrap no-icon${cf ? " filled" : ""}`}>
          <input
            type="password"
            value={cf}
            onChange={(e) => setCf(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
        </div>
        {cf && nw !== cf && (
          <span className="block text-[11.5px] text-(--danger) mt-1.5">
            Passwords don&apos;t match.
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2.5 mt-1.5 pt-3.5 border-t border-(--line-soft)">
        {resetSent ? (
          <span className="text-[12.5px] text-(--ink-faint)">
            Reset link sent to {email}.
          </span>
        ) : (
          <button
            className="forgot"
            onClick={sendReset}
            disabled={resetLoading}
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={!ready || saving}
        >
          {saving ? (
            <>
              <span className="mini-spin" /> Updating…
            </>
          ) : (
            <>
              <LockIcon />
              Update password
            </>
          )}
        </button>
      </div>
      <div className="mt-5 bg-(--paper) border border-(--line) rounded-xl overflow-hidden">
        <Row title="Active sessions" desc="Sign out all other devices.">
          <button
            className="btn btn-ghost btn-sm"
            onClick={signOutOthers}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out others"}
          </button>
        </Row>
      </div>
    </>
  );
}

/* ── Notifications panel ────────────────────────────────────────── */
function NotificationsPanel() {
  const [state, setState] = useState({
    compileDone: true,
    newSource: true,
    roleChange: true,
    weekly: false,
  });
  const set = (k: keyof typeof state, v: boolean) =>
    setState((s) => ({ ...s, [k]: v }));

  const rows: { key: keyof typeof state; title: string; desc: string }[] = [
    {
      key: "compileDone",
      title: "Compile finished",
      desc: "When a master document you follow finishes compiling.",
    },
    {
      key: "newSource",
      title: "New sources added",
      desc: "When classmates upload notes to your topics.",
    },
    {
      key: "roleChange",
      title: "Role changes",
      desc: "When your role in a class changes.",
    },
    {
      key: "weekly",
      title: "Weekly digest",
      desc: "A Monday summary of activity across your classes.",
    },
  ];

  return (
    <>
      <p className="text-[12.5px] text-(--ink-faint) leading-relaxed mb-4">
        Email notification preferences — coming soon. In-app activity logs are
        always on.
      </p>
      <div className="bg-(--paper) border border-(--line) rounded-xl overflow-hidden">
        {rows.map(({ key, title, desc }) => (
          <Row key={key} title={title} desc={desc}>
            <Toggle checked={state[key]} onChange={(v) => set(key, v)} />
          </Row>
        ))}
      </div>
    </>
  );
}

/* ── Theme helper — module-level so React Compiler doesn't touch it */
function applyTheme(t: "light" | "dark" | "auto"): typeof t {
  const cl = document.documentElement.classList;
  cl.remove("dark", "light");
  if (t !== "auto") {
    cl.add(t);
    localStorage.setItem("theme", t);
  } else {
    localStorage.removeItem("theme");
  }
  return t;
}

/* ── Preferences panel ──────────────────────────────────────────── */
function PreferencesPanel() {
  const [theme, setTheme] = useState<"light" | "dark" | "auto">(() => {
    if (typeof window === "undefined") return "auto";
    const cl = document.documentElement.classList;
    if (cl.contains("dark")) return "dark";
    if (cl.contains("light")) return "light";
    return "auto";
  });

  return (
    <div className="bg-(--paper) border border-(--line) rounded-xl overflow-hidden">
      <Row title="Theme" desc="How Notify looks on this device.">
        <div className="inline-flex bg-(--paper-deep) border border-(--line) rounded-[9px] p-0.75 gap-0.5 shrink-0">
          {(["light", "dark", "auto"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(applyTheme(t))}
              className={`capitalize border-none rounded-md font-sans text-[12px] font-medium px-2.75 py-1.25 cursor-pointer transition-colors ${
                theme === t
                  ? "bg-(--paper-raised) text-(--ink-heading) shadow-sm"
                  : "bg-transparent text-(--ink-faint) hover:text-(--ink-nav)"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>
    </div>
  );
}

/* ── Modal shell ────────────────────────────────────────────────── */
const TABS: { id: Tab; label: string; Icon: () => React.ReactNode }[] = [
  { id: "profile", label: "Profile", Icon: UserIcon },
  { id: "security", label: "Password & security", Icon: LockIcon },
  { id: "notifications", label: "Notifications", Icon: BellIcon },
  { id: "preferences", label: "Preferences", Icon: SettingsIcon },
];

export function AccountSettingsModal({ user, onClose }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [displayName, setDisplayName] = useState(user.name);
  const [displayImage, setDisplayImage] = useState<string | null>(
    user.image ?? null,
  );

  useEscapeKey(onClose);

  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-201 flex w-full max-w-190 h-140 max-h-[88vh] bg-(--paper-raised) rounded-[18px] overflow-hidden shadow-[0_40px_100px_-30px_rgba(40,30,15,0.55),0_8px_24px_-8px_rgba(40,30,15,0.18)]">
        {/* left rail */}
        <aside className="w-53 shrink-0 bg-(--paper-sidebar) border-r border-(--line) p-[22px_14px] flex flex-col">
          {/* user identity */}
          <div className="flex items-center gap-2.75 px-2 pb-4.5">
            <ModalAvatar src={displayImage} name={displayName} size={40} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-(--ink-heading) truncate">
                {displayName}
              </div>
              <div className="text-[11.5px] text-(--ink-faint) truncate">
                {user.email}
              </div>
            </div>
          </div>

          <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-(--ink-fainter) px-2 pt-3.5 pb-1.5">
            Account
          </div>

          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2.5 w-full text-left border-none font-sans text-[13.5px] font-medium px-2.5 py-2.25 rounded-[9px] cursor-pointer transition-colors mb-0.5 ${
                tab === id
                  ? "bg-(--paper-raised) text-(--accent-text) font-semibold shadow-sm [&_svg]:text-(--accent-text)"
                  : "bg-transparent text-(--ink-nav) hover:bg-[rgba(60,45,25,0.05)] hover:text-(--ink-heading) [&_svg]:text-(--ink-faint)"
              }`}
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                <Icon />
              </span>
              {label}
            </button>
          ))}

          <div className="mt-auto pt-2.5 border-t border-(--line-soft)">
            <button
              onClick={signOut}
              className="flex items-center gap-2.5 w-full text-left border-none font-sans text-[13.5px] font-medium px-2.5 py-2.25 rounded-[9px] cursor-pointer transition-colors bg-transparent text-(--danger) hover:bg-(--danger-bg) [&_svg]:text-(--danger)"
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                <LogOutIcon />
              </span>
              Sign out
            </button>
          </div>
        </aside>

        {/* right panel */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 pt-5">
            <h2 className="font-serif font-normal text-[23px] text-(--ink-heading) m-0">
              {TABS.find((t) => t.id === tab)!.label}
            </h2>
            <button className="modal-close" onClick={onClose}>
              <XIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pt-4.5 pb-6">
            {tab === "profile" && (
              <ProfilePanel
                name={displayName}
                email={user.email}
                image={displayImage}
                onNameSaved={setDisplayName}
                onImageSaved={setDisplayImage}
              />
            )}
            {tab === "security" && <SecurityPanel email={user.email} />}
            {tab === "notifications" && <NotificationsPanel />}
            {tab === "preferences" && <PreferencesPanel />}
          </div>
        </section>
      </div>
    </>
  );
}
