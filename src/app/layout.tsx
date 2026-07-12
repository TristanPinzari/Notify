import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { Toaster } from "sonner";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Notify", template: "%s · Notify" },
  description: "Collaborative notes for students",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${dmSans.variable} ${dmSerifDisplay.variable}`}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.add('light');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh flex flex-col">
        <PostHogProvider>{children}</PostHogProvider>
        <Toaster
          position="bottom-right"
          duration={2500}
          toastOptions={{
            style: {
              fontFamily: "var(--font-sans)",
              fontSize: "13.5px",
              fontWeight: "500",
              borderRadius: "11px",
              padding: "13px 16px",
              gap: "10px",
            },
          }}
        />
      </body>
    </html>
  );
}
