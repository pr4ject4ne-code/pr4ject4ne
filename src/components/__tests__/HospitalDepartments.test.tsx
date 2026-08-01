/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HospitalDepartments from '@/components/HospitalDepartments';
import type { HospitalDepartment } from '@/types';

const DEPARTMENTS: HospitalDepartment[] = [
  { id: 'dept-1', name: 'Surgery', services: ['General Surgery'] },
  { id: 'dept-2', name: 'Diagnostics', services: [] },
];

describe('HospitalDepartments — ratings (Racoon Eye v1 Phase 2)', () => {
  it('renders departments/services unchanged with no ratings props (backward compatible)', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} />);
    expect(screen.getByText('Departments (2)')).toBeInTheDocument();
    expect(screen.getByText('Surgery')).toBeInTheDocument();
    expect(screen.getByText('General Surgery')).toBeInTheDocument();
  });

  it('shows a read-only aggregate when a department has ratings', () => {
    render(
      <HospitalDepartments
        departments={DEPARTMENTS}
        ratings={{ 'dept-1': { avg: 4.5, count: 3 } }}
      />,
    );
    expect(screen.getByLabelText('Rated 4.5 out of 5')).toBeInTheDocument();
  });

  it('shows "No ratings yet" for a department with zero/missing ratings', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} ratings={{}} />);
    expect(screen.getAllByText('No ratings yet')).toHaveLength(2);
  });

  it('signed-out state (yourRatings=null): shows a sign-in prompt, no StarsInput', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={null} />);
    const signInLinks = screen.getAllByRole('link', { name: 'Sign in to rate this department' });
    expect(signInLinks).toHaveLength(2);
    expect(signInLinks[0]).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Rate 1 star')).not.toBeInTheDocument();
  });

  it('signed-in-unrated state: shows an empty StarsInput (no star pre-selected)', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={jest.fn()} />);
    const filledStars = screen.getAllByLabelText('Rate 1 star').map((btn) => btn.getAttribute('aria-pressed'));
    expect(filledStars.every((v) => v === 'false')).toBe(true);
  });

  it('signed-in-already-rated state: StarsInput is pre-seeded with yourRatings[dept.id]', () => {
    render(
      <HospitalDepartments
        departments={DEPARTMENTS}
        yourRatings={{ 'dept-1': 3 }}
        onRate={jest.fn()}
      />,
    );
    const rate3Buttons = screen.getAllByLabelText('Rate 3 stars');
    // dept-1 (first department rendered) should have its 3rd star marked pressed.
    expect(rate3Buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('selecting a score calls onRate with the correct (departmentId, score) pair', async () => {
    const onRate = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={onRate} />);

    const rate5Buttons = screen.getAllByLabelText('Rate 5 stars');
    // Second department (Diagnostics, dept-2) button.
    await user.click(rate5Buttons[1]!);

    await waitFor(() => expect(onRate).toHaveBeenCalledWith('dept-2', 5));
  });

  it('shows a pending indicator while onRate is in flight, then clears it', async () => {
    let resolveRate: () => void = () => {};
    const onRate = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={onRate} />);

    await user.click(screen.getAllByLabelText('Rate 4 stars')[0]!);
    expect(await screen.findByText('Saving…')).toBeInTheDocument();

    resolveRate();
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
    expect(await screen.findByText('Saved!')).toBeInTheDocument();
  });
});
