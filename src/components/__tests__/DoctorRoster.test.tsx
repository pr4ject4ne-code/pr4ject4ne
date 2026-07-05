/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import DoctorRoster from '@/components/DoctorRoster';
import type { Doctor } from '@/types';

const doctors = [
  {
    id: '1',
    hospital_id: 'h',
    name: 'Dr Zara Bello',
    specialty: 'Cardiology',
    level: 'consultant',
    rating_avg: 4.8,
    rating_count: 20,
    created_at: '',
    updated_at: '',
  },
  {
    id: '2',
    hospital_id: 'h',
    name: 'Dr Ada Obi',
    specialty: 'Pediatrics',
    level: 'registrar',
    rating_avg: 3.1,
    rating_count: 5,
    created_at: '',
    updated_at: '',
  },
  {
    id: '3',
    hospital_id: 'h',
    name: 'Dr Chidi Eze',
    specialty: 'Cardiology',
    level: 'intern',
    rating_avg: 0,
    rating_count: 0,
    created_at: '',
    updated_at: '',
  },
] as Doctor[];

describe('DoctorRoster', () => {
  it('lists all doctors and shows the count', () => {
    render(<DoctorRoster doctors={doctors} />);
    expect(screen.getByText('Doctors (3)')).toBeInTheDocument();
    expect(screen.getByText('Dr Ada Obi')).toBeInTheDocument();
  });

  it('sorts alphabetically by default', () => {
    render(<DoctorRoster doctors={doctors} />);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByText('Dr Ada Obi')).toBeInTheDocument();
  });

  it('filters by specialty', () => {
    render(<DoctorRoster doctors={doctors} />);
    fireEvent.change(screen.getByLabelText('Filter by specialty'), {
      target: { value: 'Pediatrics' },
    });
    expect(screen.getByText('Dr Ada Obi')).toBeInTheDocument();
    expect(screen.queryByText('Dr Zara Bello')).not.toBeInTheDocument();
  });

  it('re-sorts by rating when Top rated is chosen', () => {
    render(<DoctorRoster doctors={doctors} />);
    fireEvent.click(screen.getByText('Top rated'));
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByText('Dr Zara Bello')).toBeInTheDocument();
  });

  it('shows "No ratings" for unrated doctors', () => {
    render(<DoctorRoster doctors={doctors} />);
    expect(screen.getAllByText('No ratings').length).toBeGreaterThan(0);
  });
});
