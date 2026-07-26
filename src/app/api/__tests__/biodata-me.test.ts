/**
 * Integration tests for owner-only biodata access (/api/biodata/me).
 */
import { GET, PATCH } from '@/app/api/biodata/me/route';

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

const mockGetPatientSession = jest.fn();
const mockQueryOne = jest.fn();
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return { ...actual, getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a) };
});

jest.mock('@/lib/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const USER = '11111111-1111-4111-8111-111111111111';

describe('GET /api/biodata/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 without a session', async () => {
    mockGetPatientSession.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/biodata/me'));
    expect(res.status).toBe(401);
  });

  it('returns the owner biodata + IHN code (no IHN header needed)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: USER,
      ihn_code: 'IHN-ABCD-EFGH-JKMN',
      profile_layer: { full_name: 'Ada' },
      biodata_layer: {},
      last_modified_at: '',
    });
    const res = await GET(new Request('http://localhost/api/biodata/me'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ihn_code).toBe('IHN-ABCD-EFGH-JKMN');
    expect(json.profile_layer.full_name).toBe('Ada');
  });

  it('the owner still sees the FULL biodata_layer even when sharing_prefs is all-false (worklist #23: prefs never gate the owner)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: USER,
      ihn_code: 'IHN-ABCD-EFGH-JKMN',
      profile_layer: { full_name: 'Ada' },
      biodata_layer: { blood_group: 'O+', genotype: 'AA', clinical_conditions: [{ condition: 'Asthma' }] },
      sharing_prefs: {},
      last_modified_at: '',
    });
    const res = await GET(new Request('http://localhost/api/biodata/me'));
    const json = await res.json();
    expect(json.biodata_layer.blood_group).toBe('O+');
    expect(json.biodata_layer.genotype).toBe('AA');
    expect(json.biodata_layer.clinical_conditions).toHaveLength(1);
    expect(json.sharing_prefs).toMatchObject({ blood_group: false, genotype: false });
  });
});

describe('PATCH /api/biodata/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merges layers and derives BMI', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ profile_layer: { full_name: 'Ada' }, biodata_layer: {} });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ biodata_layer: { height_cm: 180, weight_kg: 81 } }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.biodata_layer.bmi).toBe(25);
    expect(json.profile_layer.full_name).toBe('Ada'); // preserved by merge
  });

  it('accepts and normalizes sharing_prefs as a full replace (default-deny)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      profile_layer: {},
      biodata_layer: {},
      sharing_prefs: { blood_group: true },
    });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sharing_prefs: { blood_group: false, genotype: true, not_a_field: true },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sharing_prefs.blood_group).toBe(false);
    expect(json.sharing_prefs.genotype).toBe(true);
    expect((json.sharing_prefs as Record<string, unknown>).not_a_field).toBeUndefined();
    // Persisted column must carry the same normalized value.
    const updateArgs = mockQuery.mock.calls[0][1] as string[];
    expect(JSON.parse(updateArgs[3] as string)).toMatchObject({ blood_group: false, genotype: true });
  });

  it('400 when nothing to update', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when a layer is not an object (would corrupt the merged JSON)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile_layer: 'not-an-object' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('BAD_REQUEST');
  });

  it('accepts a valid profile_photo_url and round-trips it', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ profile_layer: {}, biodata_layer: {} });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile_layer: { profile_photo_url: 'https://storage.test/photo.png' },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile_layer.profile_photo_url).toBe(
      'https://storage.test/photo.png',
    );
  });

  it('drops a profile_photo_url with a dangerous scheme instead of storing it', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ profile_layer: {}, biodata_layer: {} });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile_layer: { profile_photo_url: 'javascript:alert(1)' },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile_layer.profile_photo_url).toBeUndefined();
  });

  it('persists the four new chronic-disease sub-fields', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ profile_layer: {}, biodata_layer: {} });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          biodata_layer: {
            clinical_conditions: [
              {
                condition: 'Diabetes',
                duration: '5 years',
                progression: 'Stable',
                complication: 'None',
                care: 'Insulin',
              },
            ],
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.biodata_layer.clinical_conditions[0]).toMatchObject({
      condition: 'Diabetes',
      duration: '5 years',
      progression: 'Stable',
      complication: 'None',
      care: 'Insulin',
    });
  });

  it('escapes HTML in string field values on write', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ profile_layer: {}, biodata_layer: {} });
    const res = await PATCH(
      new Request('http://localhost/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile_layer: { full_name: '<b>Ada</b>' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile_layer.full_name).toBe('&lt;b&gt;Ada&lt;/b&gt;');
  });
});
