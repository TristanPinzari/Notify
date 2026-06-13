"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function Page() {
  const { data: session } = authClient.useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      // The Instruction: Call signOut with a callback or use Next.js router to redirect
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/"); // Force a redirect so the UI updates
            router.refresh(); // Clear any cached server components
          },
          onError: (ctx) => {
            console.error("Sign out failed:", ctx.error);
          },
        },
      });
    } catch (error) {
      console.error("An unexpected error occurred during sign out:", error);
    }
  };

  return (
    <div className="p-4">
      {session ? (
        <button
          onClick={handleSignOut}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          YEAH (Sign Out)
        </button>
      ) : (
        <p>No active session found.</p>
      )}
    </div>
  );
}
