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

describe('HospitalDepartments — item 8\'s 3-axis in-depth rating', () => {
  it('renders departments/services unchanged with no ratings props (backward compatible)', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} />);
    expect(screen.getByText('Departments (2)')).toBeInTheDocument();
    expect(screen.getByText('Surgery')).toBeInTheDocument();
    expect(screen.getByText('General Surgery')).toBeInTheDocument();
  });

  it('shows the composite average plus the per-axis breakdown when a department has ratings', () => {
    render(
      <HospitalDepartments
        departments={DEPARTMENTS}
        ratings={{ 'dept-1': { avg: 4.5, count: 3, staff_avg: 5, service_avg: 4, infrastructure_avg: 4.5 } }}
      />,
    );
    expect(screen.getByLabelText('Rated 4.5 out of 5')).toBeInTheDocument();
    expect(screen.getByText(/Staff 5\.0 · Service 4\.0 · Infrastructure 4\.5/)).toBeInTheDocument();
  });

  it('shows "No ratings yet" for a department with zero/missing ratings', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} ratings={{}} />);
    expect(screen.getAllByText('No ratings yet')).toHaveLength(2);
  });

  it('signed-out state (yourRatings=null): shows a sign-in prompt, no rating form available', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={null} />);
    const signInLinks = screen.getAllByRole('link', { name: 'Sign in to rate this department' });
    expect(signInLinks).toHaveLength(2);
    expect(signInLinks[0]).toHaveAttribute('href', '/login');
    expect(screen.queryByText('Leave an in-depth rating')).not.toBeInTheDocument();
  });

  it('signed-in-unrated state: shows "Leave an in-depth rating", not "Edit"', () => {
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={jest.fn()} />);
    expect(screen.getAllByText('Leave an in-depth rating')).toHaveLength(2);
  });

  it('signed-in-already-rated state: shows "Edit your in-depth rating", pre-seeds the form on expand', async () => {
    const user = userEvent.setup();
    render(
      <HospitalDepartments
        departments={DEPARTMENTS}
        yourRatings={{ 'dept-1': { staff_score: 5, service_score: 4, infrastructure_score: 3, review: 'Solid' } }}
        onRate={jest.fn()}
      />,
    );
    const editButtons = screen.getAllByText('Edit your in-depth rating');
    expect(editButtons).toHaveLength(1); // only dept-1 has an existing rating
    await user.click(editButtons[0]!);
    expect(screen.getByDisplayValue('Solid')).toBeInTheDocument();
    // Staff axis should have its 5th star pressed.
    const staffFifthStar = screen.getAllByLabelText('Rate 5 stars')[0];
    expect(staffFifthStar).toHaveAttribute('aria-pressed', 'true');
  });

  it('requires all three axes before submitting — shows an error instead of calling onRate', async () => {
    const onRate = jest.fn();
    const user = userEvent.setup();
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={onRate} />);

    await user.click(screen.getAllByText('Leave an in-depth rating')[0]!);
    await user.click(screen.getByText('Submit rating'));

    expect(await screen.findByText(/rate all three/i)).toBeInTheDocument();
    expect(onRate).not.toHaveBeenCalled();
  });

  it('submitting all three axes + a review calls onRate with the full submission for the right department', async () => {
    const onRate = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={onRate} />);

    // Open dept-2 (Diagnostics) specifically.
    await user.click(screen.getAllByText('Leave an in-depth rating')[1]!);
    // Axis rows render in order: staff, service, infrastructure — so within
    // the one open form, index 0/1/2 of each "Rate N stars" query line up
    // with staff/service/infrastructure respectively.
    await user.click(screen.getAllByLabelText('Rate 4 stars')[0]!); // staff = 4
    await user.click(screen.getAllByLabelText('Rate 5 stars')[1]!); // service = 5
    await user.click(screen.getAllByLabelText('Rate 3 stars')[2]!); // infrastructure = 3
    await user.type(screen.getByPlaceholderText(/write a review of this department/i), 'Great imaging team');
    await user.click(screen.getByText('Submit rating'));

    await waitFor(() =>
      expect(onRate).toHaveBeenCalledWith('dept-2', {
        staffScore: 4,
        serviceScore: 5,
        infrastructureScore: 3,
        review: 'Great imaging team',
      }),
    );
  });

  it('shows a pending indicator while onRate is in flight, then "Saved!" and collapses the form', async () => {
    let resolveRate: () => void = () => {};
    const onRate = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<HospitalDepartments departments={DEPARTMENTS} yourRatings={{}} onRate={onRate} />);

    await user.click(screen.getAllByText('Leave an in-depth rating')[0]!);
    await user.click(screen.getAllByLabelText('Rate 4 stars')[0]!);
    await user.click(screen.getAllByLabelText('Rate 4 stars')[1]!);
    await user.click(screen.getAllByLabelText('Rate 4 stars')[2]!);
    await user.click(screen.getByText('Submit rating'));
    expect(await screen.findByText('Saving…')).toBeInTheDocument();

    resolveRate();
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
    expect(await screen.findByText('Saved!')).toBeInTheDocument();
  });
});
