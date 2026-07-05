import Layout from '@/components/Layout';

export const metadata = { title: 'Privacy Policy — Racoon Eye' };

export default function PrivacyPage() {
  return (
    <Layout page="privacy">
      <div className="page-container">
        <h1>Privacy Policy</h1>
        <p>
          Racoon Eye collects the minimum data needed to provide the service: your account email,
          and any biodata you choose to add. Biodata is private by default and protected by your
          personal IHN access code.
        </p>
        <h2>Your IHN code</h2>
        <p>
          Your IHN code is a static emergency access key. Share it only with people you trust to
          access your biodata in an emergency. Every read and write of your biodata is logged.
        </p>
        <h2>Your rights</h2>
        <p>
          You can view and correct your data at any time from your dashboard. A full data-protection
          statement aligned with the Nigeria Data Protection Act is in preparation.
        </p>
      </div>
    </Layout>
  );
}
