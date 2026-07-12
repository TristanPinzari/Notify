"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { initials, avatarColor } from "@/lib/format";
import { resizeImage } from "@/lib/image";
import { getAvatarUploadUrl } from "@/server/actions/avatar";
import {
  getUserNotifications,
  updateUserNotification,
  getAccountDeletionPreview,
  deleteAccount,
} from "@/server/actions/user";
import type { NotifPrefs } from "@/server/actions/user";
import { Toggle } from "@/components/toggle";
import {
  LockIcon,
  BellIcon,
  SettingsIcon,
  LogOutIcon,
  XIcon,
  UserIcon,
  CheckIcon,
  UploadIcon,
  WarnIcon,
} from "@/components/icons";
import { applyConsent, useConsent } from "@/lib/consent";

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

/* ── Row ─────────────────────────────────────────────────────────── */
function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: React.ReactNode;
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

/* ── Delete account modal ───────────────────────────────────────── */
const DELETE_PHRASE = "delete my account";

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<{
    willDelete: { id: string; name: string }[];
    willTransfer: { id: string; name: string }[];
  } | null>(null);
  const [noTransfer, setNoTransfer] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAccountDeletionPreview().then(setPreview);
  }, []);

  function toggleTransfer(id: string) {
    setNoTransfer((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const willDelete = preview?.willDelete ?? [];
  const willTransfer = preview?.willTransfer ?? [];

  async function confirm() {
    setDeleting(true);
    const decisions = [
      ...willTransfer.map((c) => ({
        classId: c.id,
        transfer: !noTransfer.has(c.id),
      })),
      ...willDelete.map((c) => ({
        classId: c.id,
        transfer: true as const,
      })),
    ];
    const res = await deleteAccount(decisions);
    if ("error" in res) {
      if ("code" in res && res.code === "OUT_OF_SYNC") {
        setNoTransfer(new Set());
        setPreview(null);
        getAccountDeletionPreview().then(setPreview);
        toast.warning(
          "Your class list changed. Please review and confirm again.",
        );
      } else {
        toast.error(res.error);
      }
      setDeleting(false);
      return;
    }
    try {
      await authClient.signOut();
    } catch {
      // session already gone — ignore
    }
    router.push("/");
  }

  return (
    <>
      <div
        className="modal-backdrop-top"
        onClick={() => !deleting && onClose()}
      />
      <div className="modal max-w-115 z-203!">
        <div className="del-mhead">
          <span className="del-mic">
            <WarnIcon size={19} />
          </span>
          <h3>Delete your account?</h3>
        </div>
        <p className="del-mbody m-0!">
          This permanently deletes your account and removes you from all
          classes. There is no recovery.
        </p>

        {preview && preview.willTransfer.length > 0 && (
          <div className="mt-3 rounded-lg border border-(--line) bg-(--paper) overflow-hidden">
            <p className="text-[11px] font-semibold text-(--ink-faint) uppercase tracking-wide px-3.5 pt-3 pb-2">
              Ownership transfer
            </p>
            {preview.willTransfer.map((c) => {
              const transferring = !noTransfer.has(c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 border-t border-(--line-soft)"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-(--ink-heading) truncate">
                      {c.name}
                    </p>
                    <p
                      className={`text-[11.5px] mt-0.5 ${transferring ? "text-(--ink-faint)" : "text-(--danger)"}`}
                    >
                      {transferring
                        ? "The oldest member becomes the new owner"
                        : "Class will have no owner"}
                    </p>
                  </div>
                  <Toggle
                    checked={transferring}
                    onChange={() => toggleTransfer(c.id)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {willDelete.length > 0 && (
          <div className="my-3 rounded-lg border border-(--danger-soft) overflow-hidden">
            <p className="text-[11px] font-semibold text-(--danger) uppercase tracking-wide px-3.5 pt-3 pb-2">
              Will be permanently deleted
            </p>
            {willDelete.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3.5 py-2.5 border-t border-(--danger-soft)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-(--danger) shrink-0" />
                <span className="text-[12.5px] text-(--ink-body)">
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="del-hint mt-3!">
          To confirm, type <code>{DELETE_PHRASE}</code> below.
        </p>
        <input
          className={`sv-input${text && text !== DELETE_PHRASE ? " border-(--danger-soft)" : ""}`}
          value={text}
          autoFocus
          placeholder={DELETE_PHRASE}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text === DELETE_PHRASE) confirm();
          }}
        />
        <div className="del-actions">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="btn-danger-solid"
            disabled={text !== DELETE_PHRASE || deleting}
            onClick={confirm}
          >
            {deleting ? (
              <>
                <span className="mini-spin" />
                Deleting…
              </>
            ) : (
              "Delete my account"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Security panel ─────────────────────────────────────────────── */
function SecurityPanel({
  email,
  onDeleteAccount,
}: {
  email: string;
  onDeleteAccount: () => void;
}) {
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
      <div className="mt-5 border-t border-(--line-soft) pt-5">
        <p className="text-[12px] font-semibold text-(--danger) mb-2.5">
          Danger zone
        </p>
        <div className="bg-(--paper) border border-(--line) rounded-xl overflow-hidden">
          <Row
            title="Delete account"
            desc="Permanently remove your account, contributions, and owned classes."
          >
            <button className="btn-danger btn-sm" onClick={onDeleteAccount}>
              Delete account
            </button>
          </Row>
        </div>
      </div>
    </>
  );
}

/* ── Notifications panel ────────────────────────────────────────── */
const NOTIF_PLACEHOLDER = (
  <div className="w-9 h-5.25 rounded-full bg-(--line-strong) shrink-0 opacity-50" />
);

const DEFAULT_NOTIF_ROWS: {
  key: keyof NotifPrefs;
  title: string;
  desc: string;
}[] = [
  {
    key: "notifyMasterDoc",
    title: "Master doc compiled",
    desc: "Email when a master document finishes compiling.",
  },
  {
    key: "notifyRankChange",
    title: "Role changed",
    desc: "Email when your role in a class changes.",
  },
  {
    key: "notifyDigest",
    title: "Weekly digest",
    desc: "A Monday summary of activity across your classes.",
  },
];

const MEMBERSHIP_NOTIF_ROWS: {
  key: keyof NotifPrefs;
  title: string;
  desc: string;
}[] = [
  {
    key: "notifyInvite",
    title: "Invited to a class",
    desc: "Email when someone sends you a class invitation.",
  },
  {
    key: "notifyKick",
    title: "Removed from class",
    desc: "Email when you are removed from a class.",
  },
  {
    key: "notifyBanned",
    title: "Banned from class",
    desc: "Email when you are banned from a class.",
  },
  {
    key: "notifyUnbanned",
    title: "Ban lifted",
    desc: "Email when your ban is lifted and you can rejoin.",
  },
];

function NotificationsPanel() {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);

  useEffect(() => {
    getUserNotifications().then((p) => {
      if (p) setPrefs(p);
    });
  }, []);

  async function toggle(key: keyof NotifPrefs, value: boolean) {
    setPrefs((p) => p && { ...p, [key]: value });
    await updateUserNotification(key, value);
  }

  return (
    <>
      <div className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-(--ink-fainter) mb-2">
        Defaults
      </div>
      <p className="text-[12.5px] text-(--ink-faint) leading-relaxed mb-3">
        Applied when you join new classes. Override per class from the bell
        icon.
      </p>
      <div className="bg-(--paper) border border-(--line) rounded-xl overflow-hidden mb-6">
        {DEFAULT_NOTIF_ROWS.map(({ key, title, desc }) => (
          <Row key={key} title={title} desc={desc}>
            {prefs ? (
              <Toggle checked={prefs[key]} onChange={(v) => toggle(key, v)} />
            ) : (
              NOTIF_PLACEHOLDER
            )}
          </Row>
        ))}
      </div>

      <div className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-(--ink-fainter) mb-2">
        Membership
      </div>
      <p className="text-[12.5px] text-(--ink-faint) leading-relaxed mb-3">
        Events that happen outside of a class you&apos;re currently in.
      </p>
      <div className="bg-(--paper) border border-(--line) rounded-xl overflow-hidden">
        {MEMBERSHIP_NOTIF_ROWS.map(({ key, title, desc }) => (
          <Row key={key} title={title} desc={desc}>
            {prefs ? (
              <Toggle checked={prefs[key]} onChange={(v) => toggle(key, v)} />
            ) : (
              NOTIF_PLACEHOLDER
            )}
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

  const consent = useConsent();

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
      <Row
        title="Analytics cookies"
        desc={
          <>
            Allow PostHog to anonymously collect app usage data.{" "}
            <Link href="/privacy" className="lk-accent">
              Privacy Policy
            </Link>
          </>
        }
      >
        <Toggle
          checked={consent === "accepted"}
          onChange={(v) => applyConsent(v ? "accepted" : "declined")}
        />
      </Row>
    </div>
  );
}

/* ── Modal shell ────────────────────────────────────────────────── */
const TABS: { id: Tab; label: string; Icon: () => React.ReactNode }[] = [
  { id: "profile", label: "Profile", Icon: UserIcon },
  { id: "security", label: "Password & security", Icon: LockIcon },
  { id: "notifications", label: "Email Notifications", Icon: BellIcon },
  { id: "preferences", label: "Preferences", Icon: SettingsIcon },
];

export function AccountSettingsModal({ user, onClose }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [displayName, setDisplayName] = useState(user.name);
  const [displayImage, setDisplayImage] = useState<string | null>(
    user.image ?? null,
  );
  const [delAccountOpen, setDelAccountOpen] = useState(false);

  useEscapeKey(!delAccountOpen ? onClose : () => {});

  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="fixed z-201 flex bg-(--paper-raised) border border-(--line) overflow-hidden shadow-[0_40px_100px_-30px_rgba(40,30,15,0.55),0_8px_24px_-8px_rgba(40,30,15,0.18)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-190 h-140 max-h-[88vh] rounded-[18px] max-modal-compact:inset-0 max-modal-compact:translate-x-0 max-modal-compact:translate-y-0 max-modal-compact:max-w-full max-modal-compact:h-full max-modal-compact:max-h-none max-modal-compact:rounded-none max-modal-compact:flex-col">
        {/* left rail */}
        <aside className="w-53 shrink-0 bg-(--paper-sidebar) border-r border-(--line) p-[22px_14px] flex flex-col max-modal-compact:w-full max-modal-compact:flex-row max-modal-compact:p-0 max-modal-compact:border-r-0 max-modal-compact:border-b">
          {/* user identity */}
          <div className="flex items-center gap-2.75 px-2 pb-4.5 max-modal-compact:hidden">
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

          <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-(--ink-fainter) px-2 pt-3.5 pb-1.5 max-modal-compact:hidden">
            Account
          </div>

          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`acct-tab-mob flex items-center gap-2.5 w-full text-left border-none font-sans text-[13.5px] font-medium px-2.5 py-2.25 rounded-[9px] cursor-pointer transition-colors mb-0.5 ${
                tab === id
                  ? "bg-(--paper-raised) text-(--accent-text) font-semibold shadow-sm [&_svg]:text-(--accent-text)"
                  : "bg-transparent text-(--ink-nav) hover:bg-[rgba(60,45,25,0.05)] hover:text-(--ink-heading) [&_svg]:text-(--ink-faint)"
              }`}
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center max-modal-compact:w-4.5 max-modal-compact:h-4.5">
                <Icon />
              </span>
              <span className="max-modal-compact:hidden">{label}</span>
            </button>
          ))}

          <div className="mt-auto pt-2.5 border-t border-(--line-soft) max-modal-compact:hidden">
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
            {tab === "security" && (
              <SecurityPanel
                email={user.email}
                onDeleteAccount={() => setDelAccountOpen(true)}
              />
            )}
            {tab === "notifications" && <NotificationsPanel />}
            {tab === "preferences" && <PreferencesPanel />}
          </div>
        </section>
      </div>
      {delAccountOpen && (
        <DeleteAccountModal onClose={() => setDelAccountOpen(false)} />
      )}
    </>
  );
}
