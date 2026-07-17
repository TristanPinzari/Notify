import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthForm defaultMode="signup" />
    </Suspense>
  );
}
