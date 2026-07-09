"use server";

import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { Resend } from "resend";
import { rateLimit } from "./shared";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendFeedback(
  message: string,
): Promise<{ error: string } | { ok: true }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const limit = await rateLimit(session.user.id, "sendFeedback");
  if (limit) return limit;

  const trimmed = message.trim();
  if (!trimmed) return { error: "Message cannot be empty." };
  if (trimmed.length > 2000) return { error: "Message is too long." };

  const { name, email } = session.user;

  const { error } = await resend.emails.send({
    from: "Notify <noreply@notifyy.ca>",
    to: "tristanpinzari@gmail.com",
    subject: `Notify feedback from ${name}`,
    html: `<p><strong>From:</strong> ${name} &lt;${email}&gt;</p><p><strong>Message:</strong></p><p style="white-space:pre-wrap">${trimmed.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
  });

  if (error) {
    console.error("Failed to send feedback email:", error);
    return { error: "Failed to send. Please try again." };
  }

  return { ok: true };
}
