import { LegalPage } from '../legal-layout';

export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="3 November 2026">
      <p>These terms govern use of ChaseHorse Outreach (&quot;the application&quot;), a sales prospecting and outreach tool operated by ChaseHorse.</p>

      <h2>Accounts</h2>
      <p>You are responsible for keeping your password confidential and for activity under your account. Each account&apos;s data is private to that account.</p>

      <h2>Your credentials and third-party services</h2>
      <p>
        You connect your own Enricho, Google Gemini and Google accounts. You are responsible for complying with those providers&apos; terms, and for any credits, quotas or fees they
        charge. The application shows the provider&apos;s stated credit cost before actions that spend credits, but the provider&apos;s billing is authoritative.
      </p>

      <h2>Outreach and compliance</h2>
      <ul>
        <li>Emails are sent only after you approve them and confirm sending. You are the sender and are responsible for their content.</li>
        <li>You must comply with laws that apply to commercial email and personal data in your and your recipients&apos; jurisdictions, including honouring opt-out requests promptly.</li>
        <li>Do not use the application to send bulk unsolicited email, to harass anyone, or to contact people who have asked not to be contacted.</li>
      </ul>

      <h2>AI-generated content</h2>
      <p>
        Research, scores and drafts are produced by an AI model and can be wrong. The application labels AI analysis separately from provider data and cited sources. Review AI output
        before relying on it or sending it.
      </p>

      <h2>Data accuracy</h2>
      <p>Company and contact data comes from third-party providers and may be incomplete or out of date. Email addresses found by a provider are not guaranteed to be deliverable.</p>

      <h2>Availability and changes</h2>
      <p>The application is provided as is, without warranties. We may change or discontinue features. Material changes to these terms will be notified in the application.</p>

      <h2>Contact</h2>
      <p>[operator contact email]</p>
    </LegalPage>
  );
}
