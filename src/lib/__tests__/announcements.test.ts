import { jest } from '@jest/globals';

jest.unstable_mockModule('../db', () => {
  return {
    query: jest.fn(),
    queryOne: jest.fn(),
    withTransaction: jest.fn()
  };
});

const { deleteAnnouncement } = await import('../announcements');
const db = await import('../db');

describe('deleteAnnouncement guards', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('blocks deletion within 72 hours after creation', async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const startAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();

    (db.withTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'a1', created_at: createdAt, start_at: startAt }] })
      };
      return fn(tx);
    });

    await expect(deleteAnnouncement('a1')).rejects.toThrow('Announcements cannot be deleted within 3 days of creation');
  });

  test('blocks deletion within 72 hours before start', async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const startAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days from now

    (db.withTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'b2', created_at: createdAt, start_at: startAt }] })
      };
      return fn(tx);
    });

    await expect(deleteAnnouncement('b2')).rejects.toThrow('Announcements cannot be deleted within 3 days before their start date');
  });

  test('allows deletion when outside both windows', async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const startAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days from now

    (db.withTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        query: jest.fn()
          // first call: SELECT ... FOR UPDATE
          .mockResolvedValueOnce({ rows: [{ id: 'c3', created_at: createdAt, start_at: startAt }] })
          // second call: DELETE
          .mockResolvedValueOnce({ rows: [] }),
      };
      return fn(tx);
    });

    await expect(deleteAnnouncement('c3')).resolves.toBe(true);
  });
});
