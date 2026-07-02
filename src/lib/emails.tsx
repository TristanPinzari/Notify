// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  paper: "#f4efe4",
  card: "#fbf8f1",
  ink: "#2a2520",
  body: "#544d42",
  faint: "#9a9182",
  fainter: "#a89d88",
  accent: "#c47918",
  accentText: "#a85718",
  onAccent: "#fbf6ec",
  line: "#e4dccc",
  deep: "#efe8da",
};

const serif = "'DM Serif Display', Georgia, 'Times New Roman', serif";
const sans = "'DM Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const mono = "'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace";

// ─── Shared primitives ────────────────────────────────────────────────────────

function wordmark() {
  return `<div style="font-family:${serif};font-size:30px;line-height:1;color:${C.ink};">
    <span style="color:${C.accent};">N</span>otify
  </div>`;
}

function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 2px;">
    <tbody><tr>
      <td style="border-radius:11px;background:${C.accent};">
        <a href="${href}" style="display:inline-block;padding:14px 30px;font-family:${sans};font-size:15px;font-weight:600;color:${C.onAccent};text-decoration:none;border-radius:11px;">${label}</a>
      </td>
    </tr></tbody>
  </table>`;
}

function fallbackLink(href: string) {
  return `<p style="margin:20px 0 0;font-family:${sans};font-size:12.5px;line-height:1.6;color:${C.faint};">
    Button not working? Copy and paste this link into your browser:<br>
    <a href="${href}" style="color:${C.accentText};text-decoration:none;word-break:break-all;">${href}</a>
  </p>`;
}

function expiry(text: string) {
  return `<p style="margin:16px 0 0;font-family:${sans};font-size:12.5px;line-height:1.5;color:${C.faint};">${text}</p>`;
}

function h(text: string) {
  return `<h1 style="margin:14px 0 12px;font-family:${serif};font-weight:400;font-size:26px;line-height:1.2;color:${C.ink};">${text}</h1>`;
}

function p(text: string) {
  return `<p style="margin:0 0 14px;font-family:${sans};font-size:15px;line-height:1.62;color:${C.body};">${text}</p>`;
}

function footer() {
  return `<tr>
    <td style="padding:22px 40px 34px;border-top:1px solid ${C.line};">
      <p style="margin:0 0 6px;font-family:${sans};font-size:12px;line-height:1.55;color:${C.fainter};">
        You're receiving this because an account action was requested for this address. If it wasn't you, you can safely ignore this email.
      </p>
      <p style="margin:0;font-family:${mono};font-size:11px;letter-spacing:.04em;color:${C.fainter};">
        Notify &middot; Study together, one document &middot;
        <a href="https://notify.app" style="color:${C.faint};text-decoration:none;">notify.app</a>
      </p>
    </td>
  </tr>`;
}

function wrap(inner: string) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;background:${C.paper};color:${C.ink};font-family:${sans};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
      <tbody><tr>
        <td align="center" style="padding:30px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="max-width:512px;background:${C.card};border:1px solid ${C.line};border-radius:18px;overflow:hidden;">
            <tbody>
              <tr><td style="padding:30px 40px 8px;">${wordmark()}</td></tr>
              <tr><td style="padding:8px 40px 20px;">${inner}</td></tr>
              ${footer()}
            </tbody>
          </table>
        </td>
      </tr></tbody>
    </table>
  </body>
  </html>`;
}

// ─── 1 · Email verification ───────────────────────────────────────────────────

export function renderVerifyEmail({ name, url }: { name: string; url: string }) {
  return wrap(
    h("Confirm your email") +
    p(`Welcome to Notify, <strong style="color:${C.ink};">${name}</strong>. Confirm this address to activate your account and start pooling notes with your class.`) +
    button("Verify email address", url) +
    expiry("This link expires in 24 hours. You must verify before you can sign in.") +
    fallbackLink(url),
  );
}

// ─── 2 · Password reset ───────────────────────────────────────────────────────

export function renderResetPassword({ email, url }: { email: string; url: string }) {
  return wrap(
    h("Reset your password") +
    p(`We received a request to reset the password for <strong style="color:${C.ink};">${email}</strong>. Choose a new password using the button below.`) +
    button("Choose a new password", url) +
    expiry("This link expires in 60 minutes. If you didn't request a reset, ignore this email — your password stays the same.") +
    fallbackLink(url),
  );
}

// ─── 3 · Email change verification ───────────────────────────────────────────

export function renderChangeEmail({ newEmail, url }: { newEmail: string; url: string }) {
  return wrap(
    h("Verify your new email") +
    p(`You asked to change your Notify email to <strong style="color:${C.ink};">${newEmail}</strong>. Confirm the change using the button below.`) +
    button("Confirm email change", url) +
    expiry("This link expires in 30 minutes. Until you confirm, your account keeps using your current email. If this wasn’t you, change your password.") +
    fallbackLink(url),
  );
}

// ─── 4 · New email verification (post-change) ────────────────────────────────

export function renderVerifyNewEmail({ newEmail, url }: { newEmail: string; url: string }) {
  return wrap(
    h("Confirm your new email") +
    p(`A Notify account has requested <strong style="color:${C.ink};">${newEmail}</strong> as its new email address. Click below to verify this address and complete the transfer.`) +
    button("Confirm new email", url) +
    expiry("This link expires in 24 hours. If you didn't initiate this change, ignore this email — no action is needed and the request will expire.") +
    fallbackLink(url),
  );
}

// ─── 5 · Class invite ─────────────────────────────────────────────────────────

export function renderClassInvite({
  inviterName,
  className,
  memberCount,
  topicCount,
  classCode,
  url,
}: {
  inviterName: string;
  className: string;
  memberCount: number;
  topicCount: number;
  classCode: string;
  url: string;
}) {
  const initial = className.trim()[0]?.toUpperCase() ?? "C";

  const classCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin:4px 0 18px;background:${C.paper};border:1px solid ${C.line};border-radius:13px;">
      <tbody><tr><td style="padding:16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tbody><tr>
            <td width="46" valign="top">
              <div style="width:44px;height:44px;border-radius:10px;background:${C.accent};color:${C.onAccent};font-family:${serif};font-size:22px;text-align:center;line-height:44px;">${initial}</div>
            </td>
            <td style="padding-left:13px;" valign="middle">
              <div style="font-family:${sans};font-size:15px;font-weight:600;color:${C.ink};line-height:1.25;">${className}</div>
              <div style="font-family:${sans};font-size:12.5px;color:${C.faint};margin-top:2px;">${memberCount} members &middot; ${topicCount} topics</div>
            </td>
          </tr></tbody>
        </table>
      </td></tr></tbody>
    </table>`;

  const codeSpan = `<span style="font-family:${mono};font-size:13px;font-weight:500;letter-spacing:.14em;color:${C.ink};background:${C.deep};padding:3px 9px;border-radius:6px;">${classCode}</span>`;

  return wrap(
    h("You’re invited to a class") +
    p(`<strong style="color:${C.ink};">${inviterName}</strong> invited you to join their class on Notify, where classmates pool notes and compile them into one master document.`) +
    classCard +
    button("Join this class", url) +
    `<p style="margin:16px 0 0;font-family:${sans};font-size:13px;line-height:1.55;color:${C.body};">Or join manually with the code ${codeSpan}</p>` +
    expiry("This invite link expires in 7 days."),
  );
}
