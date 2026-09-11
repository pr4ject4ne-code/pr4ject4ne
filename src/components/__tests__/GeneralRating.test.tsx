/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneralRating from '@/components/GeneralRating';

describe('GeneralRating — item 8\'s per-hospital overall rating', () => {
  it('shows "No ratings yet" when the summary count is 0', () => {
    render(<GeneralRating summary={{ avg: 0, count: 0 }} />);
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
  });

  it('shows the star average + count when ratings exist', () => {
    render(<GeneralRating summary={{ avg: 4.2, count: 30 }} />);
    expect(screen.getByLabelText('Rated 4.2 out of 5')).toBeInTheDocument();
  });

  it('signed-out (yourRating undefined): shows a sign-in link, no rate button', () => {
    render(<GeneralRating summary={{ avg: 0, count: 0 }} />);
    expect(screen.getByRole('link', { name: 'Sign in to rate this hospital' })).toBeInTheDocument();
    expect(screen.queryByText('Rate this hospital')).not.toBeInTheDocument();
  });

  it('signed-in, unrated (yourRating=null): shows "Rate this hospital", not "Edit"', () => {
    render(<GeneralRating summary={{ avg: 0, count: 0 }} yourRating={null} onSubmit={jest.fn()} />);
    expect(screen.getByText('Rate this hospital')).toBeInTheDocument();
  });

  it('signed-in, already rated: shows "Edit your rating" and pre-seeds the form', async () => {
    const user = userEvent.setup();
    render(
      <GeneralRating summary={{ avg: 4, count: 1 }} yourRating={{ score: 4, review: 'Nice place' }} onSubmit={jest.fn()} />,
    );
    expect(screen.getByText('Edit your rating')).toBeInTheDocument();
    await user.click(screen.getByText('Edit your rating'));
    expect(screen.getByDisplayValue('Nice place')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Rate 4 stars')[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('requires a star selection before submitting', async () => {
    const onSubmit = jest.fn();
    const user = userEvent.setup();
    render(<GeneralRating summary={{ avg: 0, count: 0 }} yourRating={null} onSubmit={onSubmit} />);
    await user.click(screen.getByText('Rate this hospital'));
    await user.click(screen.getByText('Submit rating'));
    expect(await screen.findByText(/choose a star rating/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the score + review, then shows "Saved!" and collapses the form', async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<GeneralRating summary={{ avg: 0, count: 0 }} yourRating={null} onSubmit={onSubmit} />);

    await user.click(screen.getByText('Rate this hospital'));
    await user.click(screen.getByLabelText('Rate 5 stars'));
    await user.type(screen.getByPlaceholderText(/write a review/i), 'Excellent care');
    await user.click(screen.getByText('Submit rating'));
    expect(await screen.findByText('Saving…')).toBeInTheDocument();

    resolveSubmit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(5, 'Excellent care'));
    expect(await screen.findByText('Saved!')).toBeInTheDocument();
  });
});
