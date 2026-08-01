import Layout from '@/components/Layout';

export const metadata = { title: 'Privacy Policy | Racoon Eye' };

export default function PrivacyPage() {
  return (
    <Layout page="privacy">
      <div className="page-container">
        <h1>Privacy Policy</h1>
        <p>
          Racoon Eye collects the minimum data needed to provide the service: your account email
          and password, and any profile or biodata information you choose to add. We do not sell
          your data or use it for advertising.
        </p>

        <h2>What we collect</h2>
        <p>
          For every account: an email address, a securely hashed password (we never store your
          password itself), and an account type (patient, hospital staff, or developer). For
          patients: whatever you choose to fill in under Profile and Biodata, which can include
          contact details, next of kin, chronic conditions, genotype, blood group, and similar
          medical information. For hospitals: facility details you or your staff submit, such as
          address, coordinates, hours, services, and staff/doctor listings. We also keep a
          security audit log of sensitive actions (logins, biodata reads/writes, account changes)
          so we can investigate suspicious activity.
        </p>

        <h2>Your IHN code and biodata sharing</h2>
        <p>
          Biodata is private by default. Your IHN code is the key that unlocks whatever fields
          you have explicitly chosen to share, for whoever you give it to. It stays the same until
          you choose to regenerate it from your dashboard, which requires confirming your
          password. Every read and write of your biodata is logged, including cross-account reads
          via your IHN code.
        </p>

        <h2>Third parties we rely on</h2>
        <p>
          We use a small number of external services to run Racoon Eye: a database host (Neon,
          PostgreSQL) to store account and biodata records, an email provider (Resend) to send
          account-related emails such as verification and password reset, and a map/geocoding
          provider (MapTiler, with OpenStreetMap data) to render hospital locations and
          directions. These providers process data only to the extent needed to provide their
          service to us; we do not share your data with them for any other purpose.
        </p>

        <h2>Cookies and sessions</h2>
        <p>
          We use a single session cookie to keep you signed in. It is not used for advertising or
          cross-site tracking, and it is invalidated when you log out or change your password.
        </p>

        <h2>Your rights</h2>
        <p>
          You can view and correct your own data at any time from your dashboard, control exactly
          which biodata fields are shareable via your IHN code, and regenerate that code if you
          believe it has been shared too widely. If you would like your account and data deleted
          entirely, use the Suggestions tab to reach us.
        </p>

        <h2>A note on scope</h2>
        <p>
          This page describes, in plain language, what Racoon Eye actually does with your data
          today. A formal legal privacy statement aligned with the Nigeria Data Protection Act is
          still in preparation; if you have specific compliance questions in the meantime, please
          reach out via the Suggestions tab.
        </p>
      </div>
    </Layout>
  );
}
