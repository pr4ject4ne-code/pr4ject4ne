/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import AnnouncementCalendar from '@/components/AnnouncementCalendar';
import type { Announcement } from '@/types';

function make(partial: Partial<Announcement>): Announcement {
  return {
    id: Math.random().toString(),
    hospital_id: 'h',
    title: 'Untitled',
    body: null,
    color: 'green',
    event_date: null,
    is_bar: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...partial,
  };
}

describe('AnnouncementCalendar bar', () => {
  it('shows the explicitly flagged bar announcement', () => {
    render(
      <AnnouncementCalendar
        announcements={[
          make({ title: 'Routine', color: 'green' }),
          make({ title: 'Pinned notice', color: 'green', is_bar: true }),
        ]}
      />,
    );
    expect(screen.getByText('Pinned notice')).toBeInTheDocument();
  });

  it('falls back to the highest-priority (red) announcement when none is flagged', () => {
    render(
      <AnnouncementCalendar
        announcements={[
          make({ title: 'Minor update', color: 'green' }),
          make({ title: 'Emergency closure', color: 'red' }),
        ]}
      />,
    );
    expect(screen.getByText('Emergency closure')).toBeInTheDocument();
  });

  it('renders a calendar grid with weekday headers', () => {
    render(<AnnouncementCalendar announcements={[]} />);
    expect(screen.getByText('Su')).toBeInTheDocument();
    expect(screen.getByText('Sa')).toBeInTheDocument();
  });
});
