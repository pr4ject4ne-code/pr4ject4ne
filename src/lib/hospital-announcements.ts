import { query, withTransaction } from '@/lib/db';
import { sanitizeText } from '@/lib/sanitize';
import type { AnnouncementColor } from '@/types';

/**
 * Per-hospital announcements — rules layer.
 *
 * All date comparisons are done on calendar dates (midnight-normalized), not
 * wall-clock timestamps, because `event_date` is a DATE column. Comparing a
 * DATE against a time-of-day-bearing `now` causes off-by-one boundary errors
 * (a bug the global announcements system hit and fixed the same way — see
 * lib/announcements.ts / its test file for the original repro).
 */

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface HospitalAnnouncement {
  id: string;
  hospital_id: string;
  title: string;
  body: string | null;
  color: AnnouncementColor;
  event_date: string; // YYYY-MM-DD
  is_bar: boolean;
  recurrence_freq: RecurrenceFreq | null;
  recurrence_interval: number;
  recurrence_end_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Strip time-of-day so DATE-vs-"now" comparisons don't off-by-one at midnight. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(v: string): Date {
  // 'YYYY-MM-DD' parsed as UTC by `new Date(v)`; rebuild in local time so it
  // lines up with atMidnight()'s local-time truncation of `now`.
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/**
 * The occurrence date used for headline/delete/edit eligibility "today".
 * For a one-off announcement this is just event_date. For a recurring one,
 * advance event_date by the recurrence step until we reach the first
 * occurrence that is on or after (today - 7 days) — i.e. the occurrence
 * currently relevant to the headline window — capped at recurrence_end_date.
 * Returns null if the series has ended (all occurrences are in the past
 * beyond the end date).
 */
export function currentOccurrenceDate(
  ann: Pick<HospitalAnnouncement, 'event_date' | 'recurrence_freq' | 'recurrence_interval' | 'recurrence_end_date'>,
  now: Date = new Date(),
): Date | null {
  const anchor = parseDateOnly(ann.event_date);
  if (!ann.recurrence_freq) return anchor;

  const today = atMidnight(now);
  const endDate = ann.recurrence_end_date ? parseDateOnly(ann.recurrence_end_date) : null;
  const floor = addDays(today, -7); // occurrences older than this are no longer headline-relevant

  let occurrence = anchor;
  let iterations = 0;
  const MAX_ITERATIONS = 10_000; // guard against a bad interval looping forever

  while (occurrence < floor && iterations < MAX_ITERATIONS) {
    occurrence = stepOccurrence(occurrence, ann.recurrence_freq, ann.recurrence_interval);
    iterations += 1;
    if (endDate && occurrence > endDate) return null;
  }
  if (endDate && occurrence > endDate) return null;
  return occurrence;
}

function stepOccurrence(d: Date, freq: RecurrenceFreq, interval: number): Date {
  const r = new Date(d);
  switch (freq) {
    case 'daily':
      r.setDate(r.getDate() + interval);
      break;
    case 'weekly':
      r.setDate(r.getDate() + interval * 7);
      break;
    case 'monthly':
      r.setMonth(r.getMonth() + interval);
      break;
    case 'yearly':
      r.setFullYear(r.getFullYear() + interval);
      break;
  }
  return r;
}

/** Headline window: 2 weeks before the (occurrence) date, through 1 week after. */
export function isHeadlineEligible(
  ann: Pick<HospitalAnnouncement, 'event_date' | 'recurrence_freq' | 'recurrence_interval' | 'recurrence_end_date'>,
  now: Date = new Date(),
): boolean {
  const occurrence = currentOccurrenceDate(ann, now);
  if (!occurrence) return false;
  const today = atMidnight(now);
  const windowStart = addDays(occurrence, -14);
  const windowEnd = addDays(occurrence, 7);
  return today >= windowStart && today <= windowEnd;
}

/** Can only be modified before the announcement's date. */
export function canEdit(eventDate: string, now: Date = new Date()): boolean {
  return atMidnight(now) < parseDateOnly(eventDate);
}

/**
 * Cannot be deleted within 3 days of the announcement's date, on either side
 * (protects both "about to happen" and "just happened" announcements from
 * surprise removal). ASSUMPTION flagged per your review process: "3 days to
 * date" was read as a symmetric ±3-day lock around event_date, not one-sided.
 * Recurring series use the *current* occurrence, so the lock rolls forward
 * with each repeat rather than permanently locking after the first one.
 */
export function canDelete(
  ann: Pick<HospitalAnnouncement, 'event_date' | 'recurrence_freq' | 'recurrence_interval' | 'recurrence_end_date'>,
  now: Date = new Date(),
): boolean {
  const occurrence = currentOccurrenceDate(ann, now) ?? parseDateOnly(ann.event_date);
  const today = atMidnight(now);
  const lockStart = addDays(occurrence, -3);
  const lockEnd = addDays(occurrence, 3);
  return today < lockStart || today > lockEnd;
}

const COLORS: AnnouncementColor[] = ['green', 'yellow', 'red'];
const FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

export interface CreateHospitalAnnouncementInput {
  title: string;
  body?: string | null;
  color?: string;
  event_date: string;
  is_bar?: boolean;
  recurrence_freq?: string | null;
  recurrence_interval?: number;
  recurrence_end_date?: string | null;
}

/** List a hospital's announcements, chronologically (soonest/most-recent-relevant first). */
export async function listHospitalAnnouncements(hospitalId: string): Promise<HospitalAnnouncement[]> {
  const { rows } = await query<HospitalAnnouncement>(
    `SELECT id, hospital_id, title, body, color, event_date::text, is_bar,
            recurrence_freq, recurrence_interval, recurrence_end_date::text,
            created_at, updated_at
     FROM hospital_announcements
     WHERE hospital_id = $1
     ORDER BY event_date ASC`,
    [hospitalId],
  );
  return rows;
}

export async function createHospitalAnnouncement(
  hospitalId: string,
  input: CreateHospitalAnnouncementInput,
): Promise<HospitalAnnouncement> {
  const title = sanitizeText(input.title, 300);
  if (!title || !title.trim()) throw new Error('Title is required.');
  if (!isValidDate(input.event_date)) throw new Error('event_date must be a valid YYYY-MM-DD date.');
  const color = COLORS.includes(input.color as AnnouncementColor) ? (input.color as AnnouncementColor) : 'green';
  const body = sanitizeText(input.body ?? null, 4000);
  const isBar = input.is_bar === true;

  let recurrenceFreq: RecurrenceFreq | null = null;
  if (input.recurrence_freq) {
    if (!FREQS.includes(input.recurrence_freq as RecurrenceFreq)) {
      throw new Error('recurrence_freq must be one of daily, weekly, monthly, yearly.');
    }
    recurrenceFreq = input.recurrence_freq as RecurrenceFreq;
  }
  const recurrenceInterval =
    Number.isInteger(input.recurrence_interval) && (input.recurrence_interval as number) >= 1
      ? (input.recurrence_interval as number)
      : 1;
  let recurrenceEndDate: string | null = null;
  if (input.recurrence_end_date) {
    if (!isValidDate(input.recurrence_end_date)) throw new Error('recurrence_end_date must be a valid YYYY-MM-DD date.');
    recurrenceEndDate = input.recurrence_end_date;
  }

  return withTransaction(async (tx) => {
    if (isBar) {
      await tx.query(`UPDATE hospital_announcements SET is_bar = FALSE WHERE hospital_id = $1`, [hospitalId]);
    }
    const { rows } = await tx.query<HospitalAnnouncement>(
      `INSERT INTO hospital_announcements
         (hospital_id, title, body, color, event_date, is_bar, recurrence_freq, recurrence_interval, recurrence_end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, hospital_id, title, body, color, event_date::text, is_bar,
                 recurrence_freq, recurrence_interval, recurrence_end_date::text, created_at, updated_at`,
      [hospitalId, title, body, color, input.event_date, isBar, recurrenceFreq, recurrenceInterval, recurrenceEndDate],
    );
    return rows[0]!;
  });
}

export interface UpdateHospitalAnnouncementInput extends Partial<CreateHospitalAnnouncementInput> {}

export async function updateHospitalAnnouncement(
  hospitalId: string,
  id: string,
  updates: UpdateHospitalAnnouncementInput,
): Promise<HospitalAnnouncement> {
  return withTransaction(async (tx) => {
    const { rows: existingRows } = await tx.query<HospitalAnnouncement>(
      `SELECT id, hospital_id, title, body, color, event_date::text, is_bar,
              recurrence_freq, recurrence_interval, recurrence_end_date::text, created_at, updated_at
       FROM hospital_announcements WHERE id = $1 AND hospital_id = $2 FOR UPDATE`,
      [id, hospitalId],
    );
    const existing = existingRows[0];
    if (!existing) throw new Error('NOT_FOUND');
    if (!canEdit(existing.event_date)) {
      throw new Error('Announcements can only be modified before their date.');
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };

    if (typeof updates.title === 'string') {
      const t = sanitizeText(updates.title, 300);
      if (t && t.trim()) push('title', t);
    }
    if ('body' in updates) push('body', sanitizeText(updates.body ?? null, 4000));
    if (COLORS.includes(updates.color as AnnouncementColor)) push('color', updates.color);
    if (updates.event_date) {
      if (!isValidDate(updates.event_date)) throw new Error('event_date must be a valid YYYY-MM-DD date.');
      push('event_date', updates.event_date);
    }
    if ('recurrence_freq' in updates) {
      if (updates.recurrence_freq && !FREQS.includes(updates.recurrence_freq as RecurrenceFreq)) {
        throw new Error('recurrence_freq must be one of daily, weekly, monthly, yearly.');
      }
      push('recurrence_freq', updates.recurrence_freq || null);
    }
    if (typeof updates.recurrence_interval === 'number') {
      if (!Number.isInteger(updates.recurrence_interval) || updates.recurrence_interval < 1) {
        throw new Error('recurrence_interval must be a positive integer.');
      }
      push('recurrence_interval', updates.recurrence_interval);
    }
    if ('recurrence_end_date' in updates) {
      if (updates.recurrence_end_date && !isValidDate(updates.recurrence_end_date)) {
        throw new Error('recurrence_end_date must be a valid YYYY-MM-DD date.');
      }
      push('recurrence_end_date', updates.recurrence_end_date || null);
    }

    if (updates.is_bar === true) {
      await tx.query(`UPDATE hospital_announcements SET is_bar = FALSE WHERE hospital_id = $1`, [hospitalId]);
      push('is_bar', true);
    } else if (updates.is_bar === false) {
      push('is_bar', false);
    }

    if (sets.length === 0) return existing;

    values.push(id);
    const { rows } = await tx.query<HospitalAnnouncement>(
      `UPDATE hospital_announcements SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING id, hospital_id, title, body, color, event_date::text, is_bar,
                 recurrence_freq, recurrence_interval, recurrence_end_date::text, created_at, updated_at`,
      values,
    );
    return rows[0]!;
  });
}

export async function deleteHospitalAnnouncement(hospitalId: string, id: string): Promise<void> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<HospitalAnnouncement>(
      `SELECT id, event_date::text, recurrence_freq, recurrence_interval, recurrence_end_date::text
       FROM hospital_announcements WHERE id = $1 AND hospital_id = $2 FOR UPDATE`,
      [id, hospitalId],
    );
    const existing = rows[0];
    if (!existing) throw new Error('NOT_FOUND');
    if (!canDelete(existing)) {
      throw new Error('Announcements cannot be deleted within 3 days of their date.');
    }
    await tx.query(`DELETE FROM hospital_announcements WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  });
}
