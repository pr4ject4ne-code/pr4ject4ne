/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from '@/components/LoginForm';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('validates email before submitting in login mode', async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('enforces password strength and confirmation in signup mode', async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByText('Create account'));
    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not show a strength indicator until the user starts typing a password', () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    expect(screen.queryByText(/password strength/i)).not.toBeInTheDocument();
  });

  it('live-updates the strength indicator from weak to strong as the password improves', () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    const passwordInput = screen.getByLabelText('Password');

    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    expect(screen.getByText(/password strength: weak/i)).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters').closest('li')).toHaveClass('checkUnmet');

    fireEvent.change(passwordInput, { target: { value: 'weakerpass' } });
    expect(screen.getByText(/password strength: fair/i)).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters').closest('li')).toHaveClass('checkMet');
    expect(screen.getByText('One uppercase letter').closest('li')).toHaveClass('checkUnmet');

    fireEvent.change(passwordInput, { target: { value: 'Str0ng!x' } });
    expect(screen.getByText(/password strength: strong/i)).toBeInTheDocument();
    expect(screen.getByText('One symbol').closest('li')).toHaveClass('checkMet');
  });

  it('shows the IHN code once after a successful signup', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, ihn_code: 'IHN-ABCD-EFGH-JKMN', user_id: '1' }),
    });
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Str0ng!x' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Str0ng!x' } });
    fireEvent.click(screen.getByLabelText(/I agree/i));
    fireEvent.click(screen.getByText('Create account'));
    expect(await screen.findByText('IHN-ABCD-EFGH-JKMN')).toBeInTheDocument();
    expect(screen.getByText(/never changes/i)).toBeInTheDocument();
  });
});
