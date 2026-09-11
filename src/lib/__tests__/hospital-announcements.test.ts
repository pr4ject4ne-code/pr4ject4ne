import {
  isHeadlineEligible,
  canEdit,
  canDelete,
  currentOccurrenceDate,
} from '@/lib/hospital-announcements';

function dateStr(daysFromNow: number, ref = new Date()): string {
  const d = new Date(ref);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe('isHeadlineEligible — one-off announcements', () => {
  test('eligible exactly 14 days before the date', () => {
    const ann = { event_date: dateStr(14), recurrence_freq: null, recurrence_interval: 1, recurrence_end_date: null };
    expect(isHeadlineEligible(ann)).toBe(true);
  });

  test('NOT eligible 15 days before the date', () => {
    const ann = { event_date: dateStr(15), recurrence_freq: null, recurrence_interval: 1, recurrence_end_date: null };
    expect(isHeadlineEligible(ann)).toBe(false);
  });

  test('eligible exactly 7 days after the date', () => {
    const ann = { event_date: dateStr(-7), recurrence_freq: null, recurrence_interval: 1, recurrence_end_date: null };
    expect(isHeadlineEligible(ann)).toBe(true);
  });

  test('NOT eligible 8 days after the date', () => {
    const ann = { event_date: dateStr(-8), recurrence_freq: null, recurrence_interval: 1, recurrence_end_date: null };
    expect(isHeadlineEligible(ann)).toBe(false);
  });

  test('eligible on the date itself', () => {
    const ann = { event_date: dateStr(0), recurrence_freq: null, recurrence_interval: 1, recurrence_end_date: null };
    expect(isHeadlineEligible(ann)).toBe(true);
  });
});

describe('canEdit', () => {
  test('editable the day before the date', () => {
    expect(canEdit(dateStr(1))).toBe(true);
  });
  test('NOT editable on the date itself', () => {
    expect(canEdit(dateStr(0))).toBe(false);
  });
  test('NOT editable after the date', () => {
    expect(canEdit(dateStr(-1))).toBe(false);
  });
});

describe('canDelete', () => {
  const base = { recurrence_freq: null as null, recurrence_interval: 1, recurrence_end_date: null };

  test('blocked 3 days before the date', () => {
    expect(canDelete({ ...base, event_date: dateStr(3) })).toBe(false);
  });
  test('blocked on the date itself', () => {
    expect(canDelete({ ...base, event_date: dateStr(0) })).toBe(false);
  });
  test('blocked 3 days after the date', () => {
    expect(canDelete({ ...base, event_date: dateStr(-3) })).toBe(false);
  });
  test('allowed 4 days before the date', () => {
    expect(canDelete({ ...base, event_date: dateStr(4) })).toBe(true);
  });
  test('allowed 4 days after the date', () => {
    expect(canDelete({ ...base, event_date: dateStr(-4) })).toBe(true);
  });
});

describe('currentOccurrenceDate — recurring announcements', () => {
  test('weekly series rolls forward to the occurrence relevant to today', () => {
    const anchor = dateStr(-30); // started a month ago, weekly
    const ann = { event_date: anchor, recurrence_freq: 'weekly' as const, recurrence_interval: 1, recurrence_end_date: null };
    const occurrence = currentOccurrenceDate(ann);
    expect(occurrence).not.toBeNull();
    // The occurrence returned should itself be headline-eligible today
    // (that's the whole point of "current").
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - occurrence!.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeLessThanOrEqual(7);
  });

  test('returns null once the series has ended', () => {
    const ann = {
      event_date: dateStr(-100),
      recurrence_freq: 'monthly' as const,
      recurrence_interval: 1,
      recurrence_end_date: dateStr(-90), // series ended before any recent occurrence
    };
    expect(currentOccurrenceDate(ann)).toBeNull();
  });

  test('a recurring series stays headline-eligible indefinitely (no end date)', () => {
    const ann = {
      event_date: dateStr(-365),
      recurrence_freq: 'monthly' as const,
      recurrence_interval: 1,
      recurrence_end_date: null,
    };
    expect(isHeadlineEligible(ann)).toBe(true);
  });
});
