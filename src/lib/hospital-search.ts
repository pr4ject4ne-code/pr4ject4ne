import type { Hospital, Doctor, Announcement } from '@/types';

export interface HospitalSearchMatch {
  section: 'info' | 'doctor' | 'announcement' | 'specialty';
  label: string;
  detail?: string;
}

/**
 * Hospital-specific search: matches only within THIS hospital's info, services,
 * doctors, and announcements — not a global directory search.
 */
export function searchWithinHospital(
  query: string,
  hospital: Hospital,
  doctors: Doctor[],
  announcements: Announcement[],
): HospitalSearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: HospitalSearchMatch[] = [];

  const infoFields: Array<[string, string | null]> = [
    ['Name', hospital.name],
    ['Address', hospital.address],
    ['Website', hospital.website],
    ['Phone', hospital.contact_phone],
    ['Email', hospital.contact_email],
  ];
  for (const [label, value] of infoFields) {
    if (value && value.toLowerCase().includes(q)) {
      matches.push({ section: 'info', label, detail: value });
    }
  }

  for (const s of hospital.specialties) {
    if (s.toLowerCase().includes(q)) {
      matches.push({ section: 'specialty', label: s });
    }
  }

  for (const d of doctors) {
    if (
      d.name.toLowerCase().includes(q) ||
      (d.specialty ?? '').toLowerCase().includes(q) ||
      (d.level ?? '').toLowerCase().includes(q)
    ) {
      matches.push({
        section: 'doctor',
        label: d.name,
        detail: [d.specialty, d.level].filter(Boolean).join(' · '),
      });
    }
  }

  for (const a of announcements) {
    if (a.title.toLowerCase().includes(q) || (a.body ?? '').toLowerCase().includes(q)) {
      matches.push({ section: 'announcement', label: a.title, detail: a.body ?? undefined });
    }
  }

  return matches;
}
