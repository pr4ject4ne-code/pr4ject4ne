import { extensionForType, isStorageConfigured, uploadImage } from '@/lib/storage';

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'] as const;
const saved: Record<string, string | undefined> = {};

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const k of ENV_KEYS) {
    if (k in vars) {
      if (vars[k] === undefined) delete process.env[k];
      else process.env[k] = vars[k];
    }
  }
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.restoreAllMocks();
});

describe('extensionForType', () => {
  it('maps allowed image types', () => {
    expect(extensionForType('image/jpeg')).toBe('jpg');
    expect(extensionForType('image/png')).toBe('png');
    expect(extensionForType('image/webp')).toBe('webp');
  });
  it('rejects unsupported types', () => {
    expect(extensionForType('image/gif')).toBeNull();
    expect(extensionForType('application/pdf')).toBeNull();
  });
});

describe('isStorageConfigured', () => {
  it('is false without the required env', () => {
    setEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(isStorageConfigured()).toBe(false);
  });
  it('is true when configured', () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
    expect(isStorageConfigured()).toBe(true);
  });
});

describe('uploadImage', () => {
  beforeEach(() => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret-key',
      SUPABASE_STORAGE_BUCKET: 'media',
    });
  });

  it('POSTs the bytes and returns a public URL', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const { url } = await uploadImage({
      bytes: Buffer.from('x'),
      contentType: 'image/png',
      prefix: 'first-aid',
    });
    expect(url).toMatch(
      /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/media\/first-aid\/[0-9a-f-]+\.png$/,
    );
    const [callUrl, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callUrl).toContain('/storage/v1/object/media/first-aid/');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
  });

  it('throws when the upstream returns an error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(
      uploadImage({ bytes: Buffer.from('x'), contentType: 'image/png', prefix: 'p' }),
    ).rejects.toThrow('upload_failed_500');
  });

  it('throws when storage is not configured', async () => {
    setEnv({ SUPABASE_URL: undefined });
    await expect(
      uploadImage({ bytes: Buffer.from('x'), contentType: 'image/png', prefix: 'p' }),
    ).rejects.toThrow('storage_not_configured');
  });

  it('rejects unsupported content types', async () => {
    await expect(
      uploadImage({ bytes: Buffer.from('x'), contentType: 'image/gif', prefix: 'p' }),
    ).rejects.toThrow('unsupported_type');
  });
});
