import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-serif font-normal text-[22px] text-(--ink-heading) mb-3 mt-0">
        {title}
      </h2>
      <div className="text-[14px] leading-relaxed text-(--ink-body) space-y-3">
        {children}
      </div>
    </section>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-(--line) mt-3">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="bg-(--paper-deep) border-b border-(--line)">
            <th className="text-left font-semibold text-(--ink-heading) px-4 py-2.5 w-1/3">
              Service
            </th>
            <th className="text-left font-semibold text-(--ink-heading) px-4 py-2.5">
              Purpose
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([service, purpose], i) => (
            <tr
              key={i}
              className="border-b border-(--line) last:border-b-0 odd:bg-(--paper) even:bg-(--paper-deep)"
            >
              <td className="px-4 py-2.5 font-medium text-(--ink-heading) align-top">
                {service}
              </td>
              <td className="px-4 py-2.5 text-(--ink-body) align-top">
                {purpose}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-(--paper-deep)">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* header */}
        <div className="mb-12">
          <Link
            href="/home"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--ink-fainter) hover:text-(--ink-faint) transition-colors mb-8 block"
          >
            ← Notify
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--accent-text) mb-3">
            Legal
          </p>
          <h1 className="font-serif font-normal text-[36px] text-(--ink-heading) m-0 leading-[1.15]">
            Privacy Policy
          </h1>
          <p className="text-[13px] text-(--ink-faint) mt-3">
            Effective July 10, 2026 · Applies to all users of Notify
          </p>
        </div>

        <Section title="What Notify is">
          <p>
            Notify is a collaborative study tool for university students.
            Members of a class pool their notes, recordings, PDFs, and other
            learning materials, and Notify automatically compiles them into a
            single master document per topic.
          </p>
          <p>
            This policy explains what personal data we collect, how we use it,
            and what your rights are. If you have questions, email{" "}
            <a href="mailto:tristanpinzari@gmail.com" className="lk-accent">
              tristanpinzari@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="Data we collect">
          <p>
            <strong className="text-(--ink-heading)">
              Account information.
            </strong>{" "}
            When you sign up, we store your name, email address, and a hashed
            password. You can optionally upload a profile photo. We store
            whether your email has been verified and when your account was
            created.
          </p>
          <p>
            <strong className="text-(--ink-heading)">
              Content you upload.
            </strong>{" "}
            Files you contribute to a class — PDFs, images, audio recordings,
            Word documents — are stored on our file servers. Extracted text from
            those files is stored in our database. Master documents compiled
            from your class&apos;s sources are also stored per topic.
          </p>
          <p>
            <strong className="text-(--ink-heading)">
              Class and activity data.
            </strong>{" "}
            We record your membership in classes, your role within each class,
            the topics and sources you create, and actions you take (uploads,
            compilations, role changes, settings edits). This forms an activity
            log that is automatically deleted after four months.
          </p>
          <p>
            <strong className="text-(--ink-heading)">
              Notification preferences.
            </strong>{" "}
            Your email notification settings — which event types trigger emails
            — are stored per account.
          </p>
          <p>
            <strong className="text-(--ink-heading)">
              Analytics (optional).
            </strong>{" "}
            If you consent, we use PostHog to collect anonymous usage data:
            pages visited and features used. No content from your notes,
            sources, or master documents is ever collected. You can withdraw
            consent at any time in Preferences.
          </p>
        </Section>

        <Section title="How we use your data">
          <p>We use your data only to operate Notify:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Authenticating your account and keeping sessions secure</li>
            <li>Storing and serving your uploaded files</li>
            <li>
              Processing sources through AI models to extract text and compile
              documents
            </li>
            <li>
              Sending transactional emails you have opted into (role changes,
              new documents, invites)
            </li>
            <li>Diagnosing errors and crashes to improve reliability</li>
            <li>
              Understanding how the app is used, so we can improve it
              (analytics, with consent only)
            </li>
          </ul>
          <p>
            We do not sell your data, use it for advertising, or share it with
            any third party for their own purposes.
          </p>
        </Section>

        <Section title="Third-party services">
          <p>
            We use the following processors to operate the service. Each
            receives only the data necessary for their function.
          </p>
          <Table
            rows={[
              [
                "Google Gemini",
                "Compiles source text into master documents. Your extracted source text is sent to Google's API for processing.",
              ],
              [
                "Mistral",
                "Extracts text from images (handwriting OCR) and audio recordings (speech-to-text). File content is sent to Mistral's API.",
              ],
              [
                "AWS S3",
                "Stores uploaded files (PDFs, images, audio, Word documents) and compiled master document PDFs.",
              ],
              ["Cloudflare R2", "Stores profile avatar images."],
              [
                "Resend",
                "Sends transactional emails: email verification, password resets, class invitations, and notification emails.",
              ],
              [
                "Sentry",
                "Collects anonymous crash reports and performance traces (10% of requests) to help diagnose errors.",
              ],
              [
                "PostHog",
                "Collects anonymous analytics (page views and feature usage) only if you have given consent.",
              ],
              [
                "YouTube Transcript API",
                "Fetches transcripts for YouTube URLs you add as sources. The URL is sent to this API; no account data is shared.",
              ],
            ]}
          />
        </Section>

        <Section title="Data retention">
          <p>
            <strong className="text-(--ink-heading)">Activity logs</strong> are
            automatically pruned after four months.
          </p>
          <p>
            <strong className="text-(--ink-heading)">Uploaded files</strong> are
            kept as long as the source exists in a class. Orphaned files (where
            the source record was deleted) are cleaned up automatically.
          </p>
          <p>
            <strong className="text-(--ink-heading)">Account data</strong> is
            kept until you delete your account. Compiled master documents and
            source extractions are kept as long as the class exists or until a
            member deletes them.
          </p>
        </Section>

        <Section title="Your rights">
          <p>Under GDPR and PIPEDA you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-(--ink-heading)">Access</strong> — request
              a copy of the personal data we hold about you
            </li>
            <li>
              <strong className="text-(--ink-heading)">Correction</strong> —
              update your name or email in account settings at any time
            </li>
            <li>
              <strong className="text-(--ink-heading)">Deletion</strong> —
              request that your account and associated data be deleted
            </li>
            <li>
              <strong className="text-(--ink-heading)">Withdraw consent</strong>{" "}
              — turn off analytics cookies in Preferences at any time
            </li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href="mailto:tristanpinzari@gmail.com" className="lk-accent">
              tristanpinzari@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>Notify uses browser local storage for two purposes:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-(--ink-heading)">Theme preference</strong>{" "}
              — stores your light/dark/auto setting. No personal data; never
              leaves your device.
            </li>
            <li>
              <strong className="text-(--ink-heading)">
                Analytics consent
              </strong>{" "}
              — stores whether you accepted or declined PostHog analytics. No
              personal data; never leaves your device.
            </li>
          </ul>
          <p>
            If you accept analytics, PostHog sets a cookie to maintain an
            anonymous session identifier across page loads. This identifier is
            not linked to your account or any personal data.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes, we will update the effective date at
            the top of this page. Continued use of Notify after a change
            constitutes acceptance of the updated policy.
          </p>
        </Section>

        <div className="pt-6 border-t border-(--line) text-[12.5px] text-(--ink-fainter)">
          Questions? Email{" "}
          <a href="mailto:tristanpinzari@gmail.com" className="lk-accent">
            tristanpinzari@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
