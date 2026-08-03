/**
 * @jest-environment jsdom
 *
 * Input.tsx is the single highest-blast-radius component in the app — login,
 * signup, biodata, hospital registration, IHN lookup and password reset all
 * render their text fields through it. These tests pin the mobile-keyboard
 * wiring added here (see lib/useKeyboardSafeFocus.ts) AND, just as
 * importantly, that it composes with rather than clobbers a caller's own
 * focus/blur handlers.
 *
 * keepFocusedElementVisible is mocked rather than exercised for real: its own
 * scroll behaviour is covered end-to-end in lib/__tests__/keyboardSafeScroll.test.ts,
 * so what matters here is only the lifecycle — called on focus, released on
 * blur, released on unmount.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import Input from '@/components/Input';
import { keepFocusedElementVisible } from '@/lib/keyboardSafeScroll';

jest.mock('@/lib/keyboardSafeScroll', () => ({
  keepFocusedElementVisible: jest.fn(),
}));

const mockKeep = keepFocusedElementVisible as jest.Mock;
let release: jest.Mock;

beforeEach(() => {
  release = jest.fn();
  mockKeep.mockReset();
  mockKeep.mockReturnValue(release);
});

describe('Input mobile-keyboard wiring', () => {
  it('starts the keyboard-safe watcher on the actual input element when focused', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    fireEvent.focus(input);
    expect(mockKeep).toHaveBeenCalledTimes(1);
    expect(mockKeep).toHaveBeenCalledWith(input);
  });

  it('releases the watcher on blur', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    fireEvent.focus(input);
    expect(release).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the watcher when unmounted while still focused', () => {
    // A form that navigates away on submit unmounts with its field focused —
    // no blur ever fires, so without this the listener leaks onto the shared,
    // page-lifetime visualViewport object.
    const { unmount } = render(<Input label="Email" />);
    fireEvent.focus(screen.getByLabelText('Email'));
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not clobber a caller's own onFocus/onBlur", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    render(<Input label="Email" onFocus={onFocus} onBlur={onBlur} />);
    const input = screen.getByLabelText('Email');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(mockKeep).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('applies to password fields too, which render through the peek-toggle wrapper', () => {
    render(<Input label="Password" type="password" />);
    fireEvent.focus(screen.getByLabelText('Password'));
    expect(mockKeep).toHaveBeenCalledTimes(1);
  });
});

describe('Input rendering (unchanged behaviour)', () => {
  it('wires label, hint and error to the input for assistive tech', () => {
    render(<Input label="Email" hint="We never share it" error="Required." />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
    expect(screen.getByText('We never share it')).toBeInTheDocument();
    expect(screen.getByText('Required.')).toBeInTheDocument();
  });

  it('toggles password visibility via the Show/Hide control', () => {
    render(<Input label="Password" type="password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
