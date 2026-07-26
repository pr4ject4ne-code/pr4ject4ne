/**
 * Unit tests for the Resend wrapper (worklist #18). Mocks the `resend`
 * package itself so no network call ever happens in tests.
 */
const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}));

describe('sendEmail', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('logs a structured warning and does not throw when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import('@/lib/email');
    const result = await sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>hi</p>', text: 'hi' });
    expect(result).toEqual({ sent: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends via the Resend SDK when a key is configured', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null });
    const { sendEmail } = await import('@/lib/email');
    const result = await sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>hi</p>' });
    expect(result).toEqual({ sent: true });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.co', subject: 'Hi', html: '<p>hi</p>' }),
    );
  });

  it('returns sent:false (never throws) when the SDK reports an error', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: null, error: { message: 'bad request' } });
    const { sendEmail } = await import('@/lib/email');
    const result = await sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>hi</p>' });
    expect(result).toEqual({ sent: false });
  });

  it('returns sent:false (never throws) when the SDK call itself throws (e.g. outage)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockRejectedValue(new Error('network down'));
    const { sendEmail } = await import('@/lib/email');
    const result = await sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>hi</p>' });
    expect(result).toEqual({ sent: false });
  });
});
