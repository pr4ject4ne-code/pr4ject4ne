import { searchWithinHospital } from '@/lib/hospital-search';
import type { Hospital, Doctor, Announcement } from '@/types';

const hospital = {
  id: 'h1',
  name: 'St. Leo Hospital',
  service_type: 'hospital',
  address: '12 Independence Ave, Enugu',
  city: 'Enugu',
  latitude: null,
  longitude: null,
  website: null,
  contact_phone: '08000000000',
  contact_email: null,
  logo_url: null,
  photos: [],
  hours: {},
  specialties: ['Cardiology', 'Pediatrics'],
  departments: [],
  rating_avg: 0,
  rating_count: 0,
  is_24_hour: false,
  show_doctors: true,
  verified: true,
  account_id: null,
  status: 'approved',
  created_at: '',
  updated_at: '',
} as Hospital;

const doctors = [
  {
    id: 'd1',
    hospital_id: 'h1',
    name: 'Dr Ada Obi',
    specialty: 'Cardiology',
    level: 'consultant',
    rating_avg: 0,
    rating_count: 0,
    created_at: '',
    updated_at: '',
  },
] as Doctor[];

const announcements = [
  {
    id: 'a1',
    hospital_id: 'h1',
    title: 'Holiday closure',
    body: 'Closed on Monday',
    color: 'red',
    event_date: null,
    is_bar: false,
    created_at: '',
    updated_at: '',
  },
] as Announcement[];

describe('searchWithinHospital', () => {
  it('returns nothing for an empty query', () => {
    expect(searchWithinHospital('', hospital, doctors, announcements)).toEqual([]);
  });

  it('matches info fields', () => {
    const res = searchWithinHospital('independence', hospital, doctors, announcements);
    expect(res.some((m) => m.section === 'info' && m.label === 'Address')).toBe(true);
  });

  it('matches specialties', () => {
    const res = searchWithinHospital('cardio', hospital, doctors, announcements);
    expect(res.some((m) => m.section === 'specialty')).toBe(true);
  });

  it('matches doctors by name and specialty', () => {
    expect(
      searchWithinHospital('ada', hospital, doctors, announcements).some(
        (m) => m.section === 'doctor',
      ),
    ).toBe(true);
  });

  it('matches announcements', () => {
    expect(
      searchWithinHospital('closure', hospital, doctors, announcements).some(
        (m) => m.section === 'announcement',
      ),
    ).toBe(true);
  });

  it('returns empty for a non-matching query', () => {
    expect(searchWithinHospital('xyzzy', hospital, doctors, announcements)).toEqual([]);
  });
});
