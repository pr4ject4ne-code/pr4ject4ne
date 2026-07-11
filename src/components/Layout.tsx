import Header from './Header';
import Footer from './Footer';
import SuggestionTab from './SuggestionTab';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
  /** Pass-through props for hospital-context header. */
  hospitalName?: string;
  hospitalLogoUrl?: string | null;
  onHospitalSearch?: (query: string) => void;
  hospitalId?: string;
  /** When true, the main area has no padding (full-bleed, e.g. the map homepage). */
  fullBleed?: boolean;
  page?: string;
}

/**
 * Standard page shell: shared Header + Footer + SuggestionTab wrapping content.
 * Reused unchanged on every public page.
 */
export default function Layout({
  children,
  hospitalName,
  hospitalLogoUrl,
  onHospitalSearch,
  hospitalId,
  fullBleed,
  page,
}: LayoutProps) {
  return (
    <div className={fullBleed ? `${styles.shell} ${styles.shellFull}` : styles.shell}>
      <Header
        hospitalName={hospitalName}
        hospitalLogoUrl={hospitalLogoUrl}
        onHospitalSearch={onHospitalSearch}
        floating={fullBleed}
      />
      <main className={fullBleed ? styles.mainFull : styles.main}>{children}</main>
      <SuggestionTab hospitalId={hospitalId} page={page} />
      <Footer />
    </div>
  );
}
