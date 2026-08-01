/**
 * @jest-environment jsdom
 *
 * AccessLogPanel (planner Fix #2). Mocks `fetch` against
 * /api/biodata/access-log — the API's own auth/isolation is covered
 * separately in src/app/api/__tests__/biodata-access-log.test.ts.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccessLogPanel from '@/components/AccessLogPanel';

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe('AccessLogPanel', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    // jsdom doesn't implement scrollIntoView — ErrorBubble's banner variant
    // (see ErrorBubble.test.tsx for the same mock) calls it whenever an
    // error message appears, which is exercised by the "fetch fails" case
    // below.
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('shows the empty state when nothing has happened yet', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ entries: [], total: 0 })) as unknown as typeof fetch;
    render(<AccessLogPanel />);
    expect(await screen.findByText('No one has used your IHN code yet.')).toBeInTheDocument();
  });

  it('renders an anonymous granted read with its fields and outcome badge', async () => {
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({
        entries: [
          {
            id: 'row-1',
            created_at: '2026-07-30T10:00:00.000Z',
            requester: 'Anonymous (emergency access)',
            outcome: 'granted',
            fields_returned: ['profile_layer.full_name', 'biodata_layer.blood_group'],
          },
        ],
        total: 1,
      }),
    ) as unknown as typeof fetch;

    render(<AccessLogPanel />);

    expect(await screen.findByText('Anonymous (emergency access)')).toBeInTheDocument();
    expect(screen.getByText('Granted')).toBeInTheDocument();
    expect(screen.getByText('profile_layer.full_name')).toBeInTheDocument();
    expect(screen.getByText('biodata_layer.blood_group')).toBeInTheDocument();
  });

  it('renders an identified (authenticated patient) requester distinctly from anonymous', async () => {
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({
        entries: [
          {
            id: 'row-2',
            created_at: '2026-07-30T10:05:00.000Z',
            requester: 'Signed-in patient',
            outcome: 'granted',
            fields_returned: [],
          },
        ],
        total: 1,
      }),
    ) as unknown as typeof fetch;

    render(<AccessLogPanel />);

    expect(await screen.findByText('Signed-in patient')).toBeInTheDocument();
    expect(screen.queryByText('Anonymous (emergency access)')).not.toBeInTheDocument();
  });

  it('renders a wrong-code attempt with the wrong-code outcome badge', async () => {
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({
        entries: [
          {
            id: 'row-3',
            created_at: '2026-07-30T10:10:00.000Z',
            requester: 'Unknown',
            outcome: 'wrong_code',
            fields_returned: [],
          },
        ],
        total: 1,
      }),
    ) as unknown as typeof fetch;

    render(<AccessLogPanel />);
    expect(await screen.findByText('Wrong code')).toBeInTheDocument();
  });

  it('renders a blocked (rate-limited) attempt', async () => {
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({
        entries: [
          {
            id: 'row-4',
            created_at: '2026-07-30T10:15:00.000Z',
            requester: 'Unknown',
            outcome: 'blocked',
            fields_returned: [],
          },
        ],
        total: 1,
      }),
    ) as unknown as typeof fetch;

    render(<AccessLogPanel />);
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });

  it('shows Load more when more rows exist, and fetches/appends the next page on click', async () => {
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(
        jsonResponse({
          entries: [
            { id: 'row-1', created_at: '2026-07-30T10:00:00.000Z', requester: 'Unknown', outcome: 'granted', fields_returned: [] },
          ],
          total: 2,
        }),
      )
      .mockReturnValueOnce(
        jsonResponse({
          entries: [
            { id: 'row-2', created_at: '2026-07-29T10:00:00.000Z', requester: 'Unknown', outcome: 'granted', fields_returned: [] },
          ],
          total: 2,
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AccessLogPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('offset=20');

    // Both pages' rows are now present (appended, not replaced).
    await waitFor(() => expect(screen.getAllByText('Granted')).toHaveLength(2));
    // Load-more disappears once every row has been fetched (2 of 2).
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument());
  });

  it('shows an error message when the fetch fails', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({}, false)) as unknown as typeof fetch;
    render(<AccessLogPanel />);
    expect(await screen.findByText('Could not load your access log.')).toBeInTheDocument();
  });
});
