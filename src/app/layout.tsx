import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Notify",
  description: "Collaborative notes for students",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="bottom-right"
          duration={2500}
          richColors
          toastOptions={{
            style: {
              fontFamily: "var(--font-sans)",
              fontSize: "13.5px",
              fontWeight: "500",
              borderRadius: "11px",
              boxShadow: "0 8px 28px -10px rgba(60,45,25,0.32)",
              padding: "13px 16px",
              gap: "10px",
            },
          }}
        />
      </body>
    </html>
  );
}
