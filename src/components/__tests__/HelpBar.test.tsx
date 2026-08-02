/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import HelpBar from '@/components/HelpBar';

describe('HelpBar', () => {
  it('opens the help panel and renders help sections', () => {
    render(<HelpBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByText('Finding a hospital')).toBeInTheDocument();
    expect(screen.getByText('Understanding your IHN code')).toBeInTheDocument();
    expect(screen.getByText('Filling in your Biodata')).toBeInTheDocument();
    expect(screen.getByText('Using First Aid')).toBeInTheDocument();
    expect(screen.getByText('Reporting an issue')).toBeInTheDocument();
  });

  it('filters help content by keyword search', () => {
    render(<HelpBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    const search = screen.getByLabelText('Search help topics');
    fireEvent.change(search, { target: { value: 'IHN' } });

    expect(screen.getByText('Understanding your IHN code')).toBeInTheDocument();
    expect(screen.queryByText('Using First Aid')).not.toBeInTheDocument();
    expect(screen.queryByText('Reporting an issue')).not.toBeInTheDocument();
  });

  it('surfaces the Find by IHN topic for the searches a user would actually type', () => {
    // This explanation used to live on the /string-lookup page itself; it was
    // moved here, so the Help panel is now its ONLY home — it has to be
    // findable by the obvious queries or it is effectively gone.
    for (const query of ['IHN', 'find by ihn', 'Find by IHN', 'someone else']) {
      const { unmount } = render(<HelpBar />);
      fireEvent.click(screen.getByRole('button', { name: 'Help' }));
      fireEvent.change(screen.getByLabelText('Search help topics'), {
        target: { value: query },
      });
      expect(
        screen.getByText("Looking up someone else's biodata (Find by IHN)"),
      ).toBeInTheDocument();
      expect(screen.getByText(/only the fields the account holder has explicitly opted in/i))
        .toBeInTheDocument();
      unmount();
    }
  });

  it('shows an empty state when no topics match', () => {
    render(<HelpBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    const search = screen.getByLabelText('Search help topics');
    fireEvent.change(search, { target: { value: 'zzzznomatch' } });

    expect(screen.getByText('No help topics match that search.')).toBeInTheDocument();
  });
});
