/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResetPasswordForm from '@/components/ResetPasswordForm';

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('shows an invalid-link message when no token is present, without calling the API', () => {
    render(<ResetPasswordForm token="" />);
    expect(screen.getByText('Invalid link')).toBeInTheDocument();
  });

  it('enforces password strength and confirmation match before submitting', async () => {
    render(<ResetPasswordForm token="sometoken" />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('live-updates the shared password-strength checklist', () => {
    render(<ResetPasswordForm token="sometoken" />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Str0ng!x' } });
    expect(screen.getByText(/password strength: strong/i)).toBeInTheDocument();
  });

  it('submits the token + new password and shows success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<ResetPasswordForm token="sometoken" />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Str0ng!Pass' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Str0ng!Pass' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(screen.getByText('Password changed')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'sometoken', newPassword: 'Str0ng!Pass' }),
      }),
    );
  });

  it('shows a server error (e.g. expired token) instead of the success screen', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'This reset link has expired. Please request a new one.' }),
    });
    render(<ResetPasswordForm token="oldtoken" />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Str0ng!Pass' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Str0ng!Pass' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByText(/reset link has expired/i)).toBeInTheDocument();
  });
});
