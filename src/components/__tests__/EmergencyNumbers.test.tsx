/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import EmergencyNumbers from '@/components/EmergencyNumbers';

describe('EmergencyNumbers', () => {
  it('shows no number until a country is selected', () => {
    render(<EmergencyNumbers />);
    expect(screen.queryByText(/^112$/)).not.toBeInTheDocument();
  });

  it('shows the selected country\'s number', () => {
    render(<EmergencyNumbers />);
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'NG' } });
    expect(screen.getByText('112')).toBeInTheDocument();
  });

  it('does not default to Nigeria', () => {
    render(<EmergencyNumbers />);
    const select = screen.getByLabelText('Country') as HTMLSelectElement;
    expect(select.value).toBe('');
  });
});
