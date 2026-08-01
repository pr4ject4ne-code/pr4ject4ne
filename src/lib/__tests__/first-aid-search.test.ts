import { buildFirstAidQuery, FIRST_AID_DISCLAIMER } from '@/lib/first-aid-search';

describe('buildFirstAidQuery', () => {
  it('sets category and search when provided', () => {
    const p = new URLSearchParams(buildFirstAidQuery({ category: 'procedure', q: 'burn' }));
    expect(p.get('category')).toBe('procedure');
    expect(p.get('q')).toBe('burn');
    expect(p.get('limit')).toBe('12');
    expect(p.get('offset')).toBe('0');
  });
  it('omits an empty category', () => {
    const p = new URLSearchParams(buildFirstAidQuery({ category: '' }));
    expect(p.get('category')).toBeNull();
  });
  it('sets the topic tag when provided and omits it when empty', () => {
    expect(new URLSearchParams(buildFirstAidQuery({ tag: 'Bleeding' })).get('tag')).toBe('Bleeding');
    expect(new URLSearchParams(buildFirstAidQuery({ tag: '' })).get('tag')).toBeNull();
  });
  it('sets the region filter when provided and omits it when empty', () => {
    expect(new URLSearchParams(buildFirstAidQuery({ region: 'Chest' })).get('region')).toBe('Chest');
    expect(new URLSearchParams(buildFirstAidQuery({ region: '' })).get('region')).toBeNull();
  });
  it('sets the system filter when provided and omits it when empty', () => {
    expect(new URLSearchParams(buildFirstAidQuery({ system: 'Cardiovascular' })).get('system')).toBe(
      'Cardiovascular',
    );
    expect(new URLSearchParams(buildFirstAidQuery({ system: '' })).get('system')).toBeNull();
  });
});

describe('disclaimer', () => {
  it('states educational reference only and not-under-law', () => {
    expect(FIRST_AID_DISCLAIMER).toMatch(/educational reference only/i);
    expect(FIRST_AID_DISCLAIMER).toMatch(/not provided under law/i);
    expect(FIRST_AID_DISCLAIMER).toMatch(/back-check/i);
  });
});
