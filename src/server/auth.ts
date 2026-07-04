import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { account } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { EMAIL_RE } from "@/lib/validation";
import { Resend } from "resend";
import {
  renderResetPassword,
  renderVerifyEmail,
  renderChangeEmail,
  renderVerifyNewEmail,
} from "@/lib/emails";

const resend = new Resend(process.env.RESEND_API_KEY);
const senderEmail = "Notify <noreply@notifyy.ca>";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!EMAIL_RE.test(user.email)) {
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid email address.",
            });
          }
        },
      },
      update: {
        after: async (user) => {
          if (user.email) {
            await db
              .delete(account)
              .where(
                and(
                  eq(account.userId, user.id),
                  eq(account.providerId, "google"),
                ),
              );
          }
        },
      },
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        const { error } = await resend.emails.send({
          from: senderEmail,
          to: user.email,
          subject: "Notify | Confirm Your Email Change",
          html: renderChangeEmail({ newEmail, url }),
        });
        if (error)
          console.error("Failed to send email change confirmation:", error);
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const { error } = await resend.emails.send({
        from: senderEmail,
        to: user.email,
        subject: "Notify | Reset Your Password",
        html: renderResetPassword({ email: user.email, url }),
      });
      if (error) console.error("Failed to send reset password email:", error);
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url: rawUrl }) => {
      const isEmailChange = user.emailVerified === true;
      let url = rawUrl;
      if (isEmailChange) {
        try {
          const u = new URL(rawUrl);
          u.searchParams.set(
            "callbackURL",
            "/email-verified?type=email-change",
          );
          url = u.toString();
        } catch {}
      }
      const { error } = await resend.emails.send({
        from: senderEmail,
        to: user.email,
        subject: isEmailChange
          ? "Notify | Confirm Your New Email"
          : "Notify | Verify Your Email",
        html: isEmailChange
          ? renderVerifyNewEmail({ newEmail: user.email, url })
          : renderVerifyEmail({ name: user.name, url }),
      });
      if (error) console.error("Failed to send verification email:", error);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
