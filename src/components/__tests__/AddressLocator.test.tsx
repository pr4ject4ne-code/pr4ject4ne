/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddressLocator from '@/components/AddressLocator';

describe('AddressLocator', () => {
  afterEach(() => {
    // @ts-expect-error - test cleanup
    delete global.fetch;
  });

  it('calls onResolved with the returned coordinates on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lat: 6.45, lng: 7.5, source: 'geocode' }),
    }) as unknown as typeof fetch;
    const onResolved = jest.fn();
    render(<AddressLocator onResolved={onResolved} />);
    fireEvent.change(screen.getByLabelText('Google Maps link or address'), {
      target: { value: '12 Independence Layout, Enugu' },
    });
    fireEvent.click(screen.getByText('Locate'));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ lat: 6.45, lng: 7.5 }));
  });

  it('submits on Enter, not just the button', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lat: 6.45, lng: 7.5 }),
    }) as unknown as typeof fetch;
    const onResolved = jest.fn();
    render(<AddressLocator onResolved={onResolved} />);
    const input = screen.getByLabelText('Google Maps link or address');
    fireEvent.change(input, { target: { value: 'somewhere' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
  });

  it('shows the server error message and does not call onResolved on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Couldn't find that address." }),
    }) as unknown as typeof fetch;
    const onResolved = jest.fn();
    render(<AddressLocator onResolved={onResolved} />);
    fireEvent.change(screen.getByLabelText('Google Maps link or address'), { target: { value: 'nowhere' } });
    fireEvent.click(screen.getByText('Locate'));
    await waitFor(() => expect(screen.getByText("Couldn't find that address.")).toBeInTheDocument());
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('the Locate button is disabled with empty input', () => {
    render(<AddressLocator onResolved={jest.fn()} />);
    expect(screen.getByText('Locate')).toBeDisabled();
  });
});
