import Layout from '@/components/Layout';

export const metadata = { title: 'Terms & Conditions | Racoon Eye' };

export default function TermsPage() {
  return (
    <Layout page="terms">
      <div className="page-container">
        <h1>Terms &amp; Conditions</h1>

        <h2>Not a medical service</h2>
        <p>
          Racoon Eye is a directory and information tool. It does not provide medical diagnosis,
          treatment, or emergency dispatch. The symptom-search and first-aid features suggest
          where to seek care based on what you describe or select; they are not an assessment of
          your condition and are not a substitute for professional medical advice. If you think
          you are having an emergency, call 112 or go to the nearest hospital immediately.
        </p>

        <h2>First-aid guidance disclaimer</h2>
        <p>
          The first-aid content on Racoon Eye is an educational reference only and should not
          replace professional medical advice. Always consult a qualified healthcare provider and
          back-check any guidance. This guidance is not provided under law.
        </p>

        <h2>Use of the directory</h2>
        <p>
          Hospital and service listings include both verified institutional accounts and
          community-managed or self-registered entries. Community-managed information may be
          incomplete or out of date; use the Suggestions tab to report corrections. A listing
          appearing in search does not constitute an endorsement of that facility.
        </p>

        <h2>Your account</h2>
        <p>
          You are responsible for keeping your password and IHN code confidential, and for the
          accuracy of the information you submit. Accounts may be suspended for abuse, submitting
          fraudulent hospital listings, or attempting to access another account&apos;s data without
          authorization.
        </p>

        <h2>Hospital and facility submissions</h2>
        <p>
          Anyone can submit a facility for listing via the &quot;List your hospital&quot; page. Submissions
          are reviewed before appearing in search, and we may edit, reject, or remove a listing at
          our discretion, including if the information provided is inaccurate or cannot be
          verified.
        </p>

        <h2>Data handling</h2>
        <p>
          Patient biodata is private by default and gated by your personal IHN access code. Every
          access to biodata is logged. See the Privacy Policy for details.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may update these terms as the service evolves. Continued use of Racoon Eye after a
          change means you accept the updated terms.
        </p>
      </div>
    </Layout>
  );
}
