/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import HospitalProfileClient from '../HospitalProfileClient';
import type { Hospital, Doctor } from '@/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const BASE_HOSPITAL: Hospital = {
  id: 'h1',
  name: 'Test Facility',
  service_type: 'hospital',
  address: null,
  city: null,
  latitude: null,
  longitude: null,
  website: null,
  contact_phone: null,
  contact_email: null,
  logo_url: null,
  photos: [],
  hours: {},
  specialties: [],
  rating_avg: 0,
  rating_count: 0,
  is_24_hour: false,
  show_doctors: true,
  verified: true,
  account_id: null,
  status: 'approved',
  created_at: '',
  updated_at: '',
};

const DOCTOR: Doctor = {
  id: 'd1',
  hospital_id: 'h1',
  name: 'Dr Ada Obi',
  specialty: 'Cardiology',
  level: 'consultant',
  rating_avg: 0,
  rating_count: 0,
  created_at: '',
  updated_at: '',
};

function mockFetchWith(hospital: Hospital, doctors: Doctor[]) {
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/api/auth/session')) {
      return Promise.resolve({ ok: false } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ hospital, doctors, announcements: [] }),
    } as Response);
  }) as unknown as typeof fetch;
}

describe('HospitalProfileClient — doctors section visibility (worklist #10)', () => {
  it('renders DoctorRoster when show_doctors is true and doctors exist', async () => {
    mockFetchWith(BASE_HOSPITAL, [DOCTOR]);
    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getAllByText('Test Facility').length).toBeGreaterThan(0));
    expect(screen.getByText(/Doctors \(1\)/)).toBeInTheDocument();
  });

  it('hides DoctorRoster when show_doctors is false, even with doctors present', async () => {
    mockFetchWith({ ...BASE_HOSPITAL, show_doctors: false }, [DOCTOR]);
    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getAllByText('Test Facility').length).toBeGreaterThan(0));
    expect(screen.queryByText(/Doctors \(/)).not.toBeInTheDocument();
  });

  it('hides DoctorRoster when show_doctors is true but there are no doctors', async () => {
    mockFetchWith(BASE_HOSPITAL, []);
    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getAllByText('Test Facility').length).toBeGreaterThan(0));
    expect(screen.queryByText(/Doctors \(/)).not.toBeInTheDocument();
  });
});
