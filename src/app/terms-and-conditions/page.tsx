import Layout from '@/components/Layout';

export const metadata = { title: 'Terms & Conditions — Racoon Eye' };

export default function TermsPage() {
  return (
    <Layout page="terms">
      <div className="page-container">
        <h1>Terms &amp; Conditions</h1>
        <h2>First-aid guidance disclaimer</h2>
        <p>
          The first-aid content on Racoon Eye is an educational reference only and should not
          replace professional medical advice. Always consult a qualified healthcare provider and
          back-check any guidance. This guidance is not provided under law.
        </p>
        <h2>Use of the directory</h2>
        <p>
          Hospital and service listings include both verified institutional accounts and
          community-managed entries. Community-managed information may be incomplete or out of date;
          use the suggestion tab to report corrections.
        </p>
        <h2>Data handling</h2>
        <p>
          Patient biodata is private by default and gated by your personal IHN access code. Every
          access to biodata is logged. See the Privacy Policy for details.
        </p>
      </div>
    </Layout>
  );
}
