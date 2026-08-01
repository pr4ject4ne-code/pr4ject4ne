/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  departments: [],
  rating_avg: 0,
  rating_count: 0,
  is_24_hour: false,
  show_doctors: true,
  is_private: false,
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
    if (url.includes('/ranking')) {
      // Not under test in this file — resolve as "unavailable" so the ranking
      // panel simply stays hidden (covered separately in HospitalRankingPanel's
      // own tests + a dedicated ranking-integration case below).
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

describe('HospitalProfileClient — departments (worklist #14)', () => {
  it('renders departments and their services when present', async () => {
    mockFetchWith(
      {
        ...BASE_HOSPITAL,
        departments: [
          { id: 'dept-1', name: 'Surgery', services: ['General Surgery', 'Orthopaedics'] },
          { id: 'dept-2', name: 'Diagnostics', services: [] },
        ],
      },
      [],
    );
    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getByText(/Departments \(2\)/)).toBeInTheDocument());
    expect(screen.getByText('Surgery')).toBeInTheDocument();
    expect(screen.getByText('General Surgery')).toBeInTheDocument();
    expect(screen.getByText('Orthopaedics')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('No services listed under this department.')).toBeInTheDocument();
  });

  it('renders nothing when there are no departments', async () => {
    mockFetchWith(BASE_HOSPITAL, []);
    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getAllByText('Test Facility').length).toBeGreaterThan(0));
    expect(screen.queryByText(/Departments \(/)).not.toBeInTheDocument();
  });
});

describe('HospitalProfileClient — ratings/ranking panel (worklist #2)', () => {
  it('renders the region + national rank once the ranking endpoint resolves', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/auth/session')) return Promise.resolve({ ok: false } as Response);
      if (url.includes('/ranking')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            rating_avg: 4.5,
            rating_count: 12,
            region: { rank: 2, total: 6 },
            national: { rank: 5, total: 20 },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ hospital: { ...BASE_HOSPITAL, city: 'Enugu' }, doctors: [], announcements: [] }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getByText(/of 6/)).toBeInTheDocument());
    expect(screen.getByText('In Enugu')).toBeInTheDocument();
    expect(screen.getByText(/#2 of 6/)).toBeInTheDocument();
    expect(screen.getByText(/#5 of 20/)).toBeInTheDocument();
  });

  it('shows "Not yet rated" instead of a nonsensical rank for a zero-review hospital', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/auth/session')) return Promise.resolve({ ok: false } as Response);
      if (url.includes('/ranking')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            rating_avg: 0,
            rating_count: 0,
            region: { rank: 1, total: 1 },
            national: { rank: 1, total: 1 },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ hospital: BASE_HOSPITAL, doctors: [], announcements: [] }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getByText('Not yet rated')).toBeInTheDocument());
    expect(screen.queryByText(/#1 of 1/)).not.toBeInTheDocument();
  });
});

describe('HospitalProfileClient — department ratings (Racoon Eye v1 Phase 2)', () => {
  const HOSPITAL_WITH_DEPT: Hospital = {
    ...BASE_HOSPITAL,
    rating_avg: 3.5,
    rating_count: 2,
    departments: [{ id: 'dept-1', name: 'Surgery', services: [] }],
  };

  it('rating a department patches the displayed department avg/count and hospital rating_avg from the POST response, without a full refetch', async () => {
    const postCalls: Array<{ url: string; body: unknown }> = [];
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('/ranking')) return Promise.resolve({ ok: false } as Response);
      if (init?.method === 'POST' && url.includes('/ratings')) {
        postCalls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            department_avg: 4.5,
            department_count: 3,
            hospital_rating_avg: 4.5,
            hospital_rating_count: 3,
            your_score: 5,
          }),
        } as Response);
      }
      // The base GET /api/hospitals/[id] call — signed-in, unrated dept.
      return Promise.resolve({
        ok: true,
        json: async () => ({
          hospital: HOSPITAL_WITH_DEPT,
          doctors: [],
          announcements: [],
          department_ratings: { 'dept-1': { avg: 3.5, count: 2 } },
          your_ratings: {},
        }),
      } as Response);
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getByText(/Departments \(1\)/)).toBeInTheDocument());

    // Pre-rating state: department shows the initial aggregate.
    expect(screen.getByLabelText('Rated 3.5 out of 5')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Rate 5 stars'));

    // Patched from the POST response — new department avg/count.
    await waitFor(() => expect(screen.getByLabelText('Rated 4.5 out of 5')).toBeInTheDocument());
    expect(screen.getByText('4.5 (3)')).toBeInTheDocument();

    expect(postCalls).toHaveLength(1);
    expect(postCalls[0]!.url).toBe('/api/hospitals/h1/departments/dept-1/ratings');
    expect(postCalls[0]!.body).toEqual({ score: 5 });

    // Only the initial GET (+ ranking) happened — no second GET to
    // /api/hospitals/h1 fired as part of rating (no full refetch).
    const getRefetches = (global.fetch as jest.Mock).mock.calls.filter(
      ([url, init]: [string, RequestInit | undefined]) =>
        url === '/api/hospitals/h1' && init?.method !== 'POST',
    );
    expect(getRefetches).toHaveLength(1);
  });

  it('shows a sign-in prompt (no StarsInput) when your_ratings is absent (signed out)', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/ranking')) return Promise.resolve({ ok: false } as Response);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          hospital: HOSPITAL_WITH_DEPT,
          doctors: [],
          announcements: [],
          department_ratings: {},
          // your_ratings omitted entirely, mirroring the real signed-out response.
        }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<HospitalProfileClient id="h1" />);
    await waitFor(() => expect(screen.getByText(/Departments \(1\)/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Sign in to rate this department' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Rate 5 stars')).not.toBeInTheDocument();
  });
});
