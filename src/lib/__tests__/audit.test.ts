/**
 * Unit tests for the audit logger and client-IP extraction.
 *
 * The swallow contract is load-bearing: audit logging must never break the
 * primary request, so a DB failure inside logAudit must resolve (not throw).
 */
import { logAudit, clientIpFrom } from '@/lib/audit';

const mockQuery = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('logAudit', () => {
  it('writes the expected audit_logs columns in order', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await logAudit({
      userId: 'u1',
      action: 'biodata_read',
      resourceType: 'biodata',
      resourceId: 'r1',
      details: { via: 'ihn_code' },
      ip: '203.0.113.5',
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, values] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(values).toEqual([
      'u1',
      'biodata_read',
      'biodata',
      'r1',
      JSON.stringify({ via: 'ihn_code' }),
      '203.0.113.5',
    ]);
  });

  it('defaults optional fields to null / empty details', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await logAudit({ action: 'login_failed' });
    const [, values] = mockQuery.mock.calls[0];
    expect(values).toEqual([null, 'login_failed', null, null, JSON.stringify({}), null]);
  });

  it('never throws when the DB write fails (swallow contract)', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(logAudit({ action: 'login' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('clientIpFrom', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' });
    expect(clientIpFrom(h)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip when no forwarded-for', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.7' });
    expect(clientIpFrom(h)).toBe('198.51.100.7');
  });

  it('returns null when neither header is present', () => {
    expect(clientIpFrom(new Headers())).toBeNull();
  });
});
