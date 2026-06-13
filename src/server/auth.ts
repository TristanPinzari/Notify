import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!USERNAME_RE.test(user.name)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Username must be 3–20 characters, letters, numbers and underscores only.",
            });
          }
          if (!EMAIL_RE.test(user.email)) {
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid email address.",
            });
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    sendResetPassword: async ({ url }) => {
      console.log(`Reset: ${url}`);
    },
  },
  emailVerification: {
    callBackURL: "/verified",
    sendVerificationEmail: async ({ url }) => {
      console.log(`Verify: ${url}`);
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
