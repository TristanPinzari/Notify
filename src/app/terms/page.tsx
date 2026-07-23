import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service" };

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

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-[13px] text-(--ink-faint) mt-3">
            Effective July 23, 2026 · Applies to all users of Notify
          </p>
        </div>

        <Section title="Agreement to these terms">
          <p>
            By creating an account or using Notify, you agree to these Terms of
            Service. If you do not agree, do not use the service. These terms
            form a binding agreement between you and the individual operating
            Notify (Tristan Pinzari).
          </p>
        </Section>

        <Section title="What Notify is">
          <p>
            Notify is a collaborative study tool for university students.
            Members of a class pool their notes, recordings, PDFs, and other
            learning materials, and Notify automatically compiles them into a
            single master document per topic using AI.
          </p>
          <p>
            Notify is provided as-is, on a best-effort basis. It is not
            affiliated with any university or educational institution.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for maintaining the security of your account and
            password. You must provide accurate information when you sign up and
            keep it up to date. You may not share your account with others or
            create accounts on behalf of someone else.
          </p>
          <p>
            You must be at least 13 years old to use Notify. By creating an
            account, you confirm that you meet this requirement.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to use Notify to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Upload content you do not have the right to share</li>
            <li>
              Harass, impersonate, or harm other members of a class
            </li>
            <li>
              Attempt to gain unauthorized access to other accounts, classes, or
              our systems
            </li>
            <li>
              Use the service to distribute spam, malware, or other harmful
              content
            </li>
            <li>
              Violate your institution&apos;s academic integrity policy by
              submitting AI-compiled content as your own original work without
              appropriate disclosure
            </li>
          </ul>
          <p>
            We reserve the right to suspend or terminate accounts that violate
            these rules without notice.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            You own the content you upload to Notify. By uploading it, you grant
            us a limited licence to store, process, and display it solely for
            the purpose of operating the service — for example, extracting text
            to compile a master document, or displaying a file to members of
            your class.
          </p>
          <p>
            We do not claim ownership of your notes, files, or any content you
            contribute. We do not use your content to train AI models.
          </p>
          <p>
            You are responsible for ensuring that the content you upload does
            not infringe third-party copyright or other rights. Do not upload
            material you are not permitted to share.
          </p>
        </Section>

        <Section title="AI processing">
          <p>
            Notify uses third-party AI services (currently Google Gemini and
            Mistral) to extract text from files and compile master documents.
            Your uploaded content and extracted text are sent to these services
            for processing. By using Notify, you consent to this.
          </p>
          <p>
            AI-generated compilations may contain errors, omissions, or
            inaccuracies. Always verify important information against your
            original sources. Notify is a study aid, not a substitute for
            engaging with course material directly.
          </p>
        </Section>

        <Section title="Disclaimer of warranties">
          <p>
            Notify is provided <strong className="text-(--ink-heading)">&ldquo;as is&rdquo;</strong> without
            warranty of any kind. We make no guarantees that the service will be
            available at all times, error-free, or that compiled documents will
            be accurate or complete.
          </p>
          <p>
            To the maximum extent permitted by applicable law, we disclaim all
            warranties, express or implied, including merchantability, fitness
            for a particular purpose, and non-infringement.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, Tristan Pinzari shall not
            be liable for any indirect, incidental, special, consequential, or
            punitive damages — including loss of data, loss of academic
            standing, or any other harm — arising from your use of or inability
            to use Notify, even if advised of the possibility of such damages.
          </p>
          <p>
            Our total liability to you for any claim arising from use of Notify
            shall not exceed the amount you paid us in the twelve months
            preceding the claim, or CAD $10, whichever is greater.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may delete your account at any time from account settings. We
            may suspend or terminate your access if you violate these terms, if
            the service is discontinued, or for any other reason at our
            discretion with reasonable notice where practicable.
          </p>
          <p>
            Classes you own will be handled according to our ownership transfer
            policy described in the app. Orphaned classes with no activity for
            six months may be permanently deleted.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the Province of Ontario and
            the federal laws of Canada applicable therein. Any disputes will be
            resolved in the courts of Ontario.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms from time to time. If we make material
            changes, we will update the effective date at the top of this page.
            Continued use of Notify after a change constitutes acceptance of the
            updated terms.
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
