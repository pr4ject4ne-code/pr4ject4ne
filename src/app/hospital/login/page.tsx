import { redirect } from 'next/navigation';

export const metadata = { title: 'Hospital Login', robots: { index: false, follow: false } };

/**
 * Login is unified: everyone enters at /login and is routed by account type.
 * This legacy path just forwards there so old bookmarks keep working.
 */
export default function HospitalLoginPage() {
  redirect('/login');
}
