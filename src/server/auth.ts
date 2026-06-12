import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ url }) => {
      console.log(`Reset: ${url}`);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ url }) => {
      console.log(`Verify: ${url}`);
    },
  },
});

export type Session = typeof auth.$Infer.Session;
