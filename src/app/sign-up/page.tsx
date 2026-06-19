import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return <AuthForm defaultMode="signup" />;
}
