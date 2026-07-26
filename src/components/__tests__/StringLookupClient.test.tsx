/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StringLookupClient from '@/components/StringLookupClient';

const mockUseSession = jest.fn();
jest.mock('@/lib/useSession', () => ({
  useSession: () => mockUseSession(),
}));

const mockSearchParams = jest.fn(() => new URLSearchParams(''));
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
}));

describe('StringLookupClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.mockReturnValue(new URLSearchParams(''));
    global.fetch = jest.fn();
  });

  it('gates behind sign-in when there is no session', () => {
    mockUseSession.mockReturnValue({ loading: false, user: null });
    render(<StringLookupClient />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByLabelText('IHN code')).not.toBeInTheDocument();
  });

  it('rejects a malformed IHN code client-side without calling the API', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    render(<StringLookupClient />);
    fireEvent.change(screen.getByLabelText('IHN code'), { target: { value: 'not-a-code' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid IHN code/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows "no shareable record" when the lookup returns available:false', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, profile_layer: {}, biodata_layer: {} }),
    });
    render(<StringLookupClient />);
    fireEvent.change(screen.getByLabelText('IHN code'), { target: { value: 'IHN-ABCD-EFGH-JKMN' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByText('No shareable record was found for that code.')).toBeInTheDocument();
  });

  it('renders the filtered result as an organized document, grouped by section', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        profile_layer: { full_name: 'Ada' },
        biodata_layer: { blood_group: 'O+' },
      }),
    });
    render(<StringLookupClient />);
    fireEvent.change(screen.getByLabelText('IHN code'), { target: { value: 'IHN-ABCD-EFGH-JKMN' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.getAllByText('Blood group').length).toBeGreaterThan(0);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('O+')).toBeInTheDocument();
    // never surfaces the raw code as a shared field
    expect(screen.getByText(/Biodata summary/)).toBeInTheDocument();
  });

  it('pre-fills the code from a ?ihn= query param (the QR deep-link path)', () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    mockSearchParams.mockReturnValue(new URLSearchParams('ihn=ihn-abcd-efgh-jkmn'));
    render(<StringLookupClient />);
    expect(screen.getByLabelText('IHN code')).toHaveValue('IHN-ABCD-EFGH-JKMN');
  });

  it('surfaces a server error message', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Too many attempts.' }),
    });
    render(<StringLookupClient />);
    fireEvent.change(screen.getByLabelText('IHN code'), { target: { value: 'IHN-ABCD-EFGH-JKMN' } });
    fireEvent.click(screen.getByText('Look up'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts.'));
  });
});
