/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import AnnouncementCalendar from '@/components/AnnouncementCalendar';
import type { Announcement } from '@/types';

function dateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function make(partial: Partial<Announcement>): Announcement {
  return {
    id: Math.random().toString(),
    hospital_id: 'h',
    title: 'Untitled',
    body: null,
    color: 'green',
    event_date: dateStr(0),
    is_bar: false,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_end_date: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...partial,
  };
}

describe('AnnouncementCalendar (tab strip)', () => {
  it('renders nothing when there are no announcements', () => {
    const { container } = render(<AnnouncementCalendar announcements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when announcements exist but none are headline-eligible', () => {
    const { container } = render(
      <AnnouncementCalendar announcements={[make({ title: 'Old news', event_date: dateStr(-30) })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a tab for an announcement within its headline window', () => {
    render(<AnnouncementCalendar announcements={[make({ title: 'Clinic closed Friday', event_date: dateStr(5) })]} />);
    expect(screen.getByText('Clinic closed Friday')).toBeInTheDocument();
  });

  it('orders multiple tabs chronologically, with the is_bar item pinned first', () => {
    render(
      <AnnouncementCalendar
        announcements={[
          make({ title: 'Later', event_date: dateStr(6) }),
          make({ title: 'Pinned', event_date: dateStr(3), is_bar: true }),
          make({ title: 'Sooner', event_date: dateStr(1) }),
        ]}
      />,
    );
    const tabs = screen.getAllByRole('listitem').map((el) => el.textContent);
    expect(tabs).toEqual(['Pinned', 'Sooner', 'Later']);
  });
});
