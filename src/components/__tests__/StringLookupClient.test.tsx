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

  it('auto-formats a lowercase, dash-free typed value before calling the API (founder ask, not a numbered worklist item)', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, profile_layer: {}, biodata_layer: {} }),
    });
    render(<StringLookupClient />);
    const input = screen.getByLabelText('IHN code');
    fireEvent.change(input, { target: { value: 'ihnabcdefghjkmn' } });
    expect(input).toHaveValue('IHN-ABCD-EFGH-JKMN');
    fireEvent.click(screen.getByText('Look up'));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('IHN-ABCD-EFGH-JKMN')),
      ),
    );
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

  it('renders the filtered result as an organized report, grouped by section', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        profile_layer: { full_name: 'Ada' },
        biodata_layer: { blood_group: 'O+' },
        report: {
          generatedAt: '2026-07-26T00:00:00Z',
          photoUrl: null,
          declaration: 'This report reflects information the account holder has chosen to share.',
          sections: [
            { key: 'profile', title: 'Profile', rows: [{ label: 'Full name', value: 'Ada' }] },
            { key: 'blood_group', title: 'Blood group', rows: [{ label: 'Blood group', value: 'O+' }] },
          ],
          signatures: [],
        },
      }),
    });
    render(<StringLookupClient />);
    fireEvent.change(screen.getByLabelText('IHN code'), { target: { value: 'IHN-ABCD-EFGH-JKMN' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.getAllByText('Blood group').length).toBeGreaterThan(0);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('O+')).toBeInTheDocument();
    expect(screen.getByText(/This report reflects information/)).toBeInTheDocument();
    // never surfaces the raw code as a shared field
    expect(screen.getByText(/Biodata report/)).toBeInTheDocument();
  });

  it('shows a doctor signature block only when the report includes one (approved consent)', async () => {
    mockUseSession.mockReturnValue({ loading: false, user: { id: 'u1' } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        profile_layer: {},
        biodata_layer: { clinical_conditions: [{ condition: 'Hypertension', doctor_id: 'd1' }] },
        report: {
          generatedAt: '2026-07-26T00:00:00Z',
          photoUrl: null,
          declaration: 'declaration text',
          sections: [
            {
              key: 'clinical_conditions',
              title: 'Clinical conditions',
              rows: [{ label: 'Condition', value: 'Hypertension — confirmed by Dr. Ada Obi' }],
            },
          ],
          signatures: [{ doctorId: 'd1', name: 'Ada Obi', contact: '0800-000-0000' }],
        },
      }),
    });
    render(<StringLookupClient />);
    fireEvent.change(screen.getByLabelText('IHN code'), { target: { value: 'IHN-ABCD-EFGH-JKMN' } });
    fireEvent.click(screen.getByText('Look up'));
    expect(await screen.findByText('Dr. Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('0800-000-0000')).toBeInTheDocument();
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
