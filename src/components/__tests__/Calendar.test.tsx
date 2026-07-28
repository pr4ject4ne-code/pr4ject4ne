/**
 * @jest-environment jsdom
 *
 * Calendar (extended with patient-personal reminders, founder ask). Mocks
 * `fetch` against /api/reminders — the API's own auth/isolation/validation is
 * covered separately in src/app/api/__tests__/reminders.test.ts.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Calendar from '@/components/Calendar';

const today = new Date();
const TODAY_DAY = today.getDate();

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe('Calendar reminders', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('loads reminders and marks the day that has one', async () => {
    const remindAt = new Date(today.getFullYear(), today.getMonth(), TODAY_DAY, 9, 0).toISOString();
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({
        reminders: [{ id: 'r1', title: 'Take meds', note: null, remind_at: remindAt, created_at: remindAt }],
      }),
    ) as unknown as typeof fetch;

    render(<Calendar />);

    await waitFor(() => expect(screen.queryByText('Loading reminders…')).not.toBeInTheDocument());

    const dayButton = screen.getByRole('gridcell', { name: String(TODAY_DAY) });
    expect(within(dayButton).getByText(String(TODAY_DAY))).toBeInTheDocument();
    // Marker span is present as a decorative child of today's cell.
    expect(dayButton.querySelector('span')).toBeTruthy();
  });

  it('clicking a day shows its reminders and an add-reminder form', async () => {
    const remindAt = new Date(today.getFullYear(), today.getMonth(), TODAY_DAY, 14, 30).toISOString();
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({
        reminders: [{ id: 'r1', title: 'Follow-up call', note: 'bring test results', remind_at: remindAt, created_at: remindAt }],
      }),
    ) as unknown as typeof fetch;

    render(<Calendar />);
    await waitFor(() => expect(screen.queryByText('Loading reminders…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('gridcell', { name: String(TODAY_DAY) }));

    expect(await screen.findByText('Follow-up call')).toBeInTheDocument();
    expect(screen.getByText('bring test results')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add reminder' })).toBeInTheDocument();
  });

  it('submitting the form POSTs to /api/reminders and shows the new reminder', async () => {
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(jsonResponse({ reminders: [] })) // initial GET
      .mockReturnValueOnce(
        jsonResponse(
          {
            reminder: {
              id: 'new-1',
              title: 'Book appointment',
              note: null,
              remind_at: new Date(today.getFullYear(), today.getMonth(), TODAY_DAY).toISOString(),
              created_at: new Date().toISOString(),
            },
          },
          true,
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Calendar />);
    await waitFor(() => expect(screen.queryByText('Loading reminders…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('gridcell', { name: String(TODAY_DAY) }));
    expect(await screen.findByText('No reminders for this date.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Book appointment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    expect(await screen.findByText('Book appointment')).toBeInTheDocument();
    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe('/api/reminders');
    expect(postCall[1].method).toBe('POST');
    const sentBody = JSON.parse(postCall[1].body as string);
    expect(sentBody.title).toBe('Book appointment');
  });

  it('shows a validation error when submitting without a title', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ reminders: [] })) as unknown as typeof fetch;
    render(<Calendar />);
    await waitFor(() => expect(screen.queryByText('Loading reminders…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('gridcell', { name: String(TODAY_DAY) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add reminder' }));

    expect(await screen.findByText('A title is required.')).toBeInTheDocument();
  });

  it('deletes a reminder via the Delete button', async () => {
    const remindAt = new Date(today.getFullYear(), today.getMonth(), TODAY_DAY, 9, 0).toISOString();
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(
        jsonResponse({
          reminders: [{ id: 'r1', title: 'Take meds', note: null, remind_at: remindAt, created_at: remindAt }],
        }),
      )
      .mockReturnValueOnce(jsonResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Calendar />);
    await waitFor(() => expect(screen.queryByText('Loading reminders…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('gridcell', { name: String(TODAY_DAY) }));
    expect(await screen.findByText('Take meds')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete reminder: Take meds' }));

    await waitFor(() => expect(screen.queryByText('Take meds')).not.toBeInTheDocument());
    const [, deleteCall] = fetchMock.mock.calls;
    expect(deleteCall[0]).toBe('/api/reminders/r1');
    expect(deleteCall[1].method).toBe('DELETE');
  });
});
