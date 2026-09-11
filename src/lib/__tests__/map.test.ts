import { distanceKm, parseGoogleMapsUrl } from '@/lib/map';

describe('distanceKm', () => {
  it('is ~0 for identical points', () => {
    expect(distanceKm({ lat: 6.45, lng: 7.5 }, { lat: 6.45, lng: 7.5 })).toBeCloseTo(0, 5);
  });
  it('computes a positive distance between distinct points', () => {
    const d = distanceKm({ lat: 6.45, lng: 7.5 }, { lat: 6.55, lng: 7.6 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(20);
  });
});

describe('parseGoogleMapsUrl', () => {
  it('extracts coordinates from the @lat,lng,zoom viewport form', () => {
    const coords = parseGoogleMapsUrl('https://www.google.com/maps/@6.4531,3.3958,15z');
    expect(coords).toEqual({ lat: 6.4531, lng: 3.3958 });
  });

  it('extracts coordinates from a place URL that has both @ and !3d!4d — the !3d!4d pin wins (more precise than the viewport center)', () => {
    const url =
      'https://www.google.com/maps/place/Some+Hospital/@6.45,3.39,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d6.4602!4d3.4001';
    expect(parseGoogleMapsUrl(url)).toEqual({ lat: 6.4602, lng: 3.4001 });
  });

  it('extracts coordinates from a ?q=lat,lng share link', () => {
    expect(parseGoogleMapsUrl('https://maps.google.com/?q=6.4531,3.3958')).toEqual({ lat: 6.4531, lng: 3.3958 });
  });

  it('returns null for a shortened link — no coordinates in the URL text to parse', () => {
    expect(parseGoogleMapsUrl('https://maps.app.goo.gl/AbC123xyz')).toBeNull();
  });

  it('returns null for a plain address (not a URL at all)', () => {
    expect(parseGoogleMapsUrl('12 Independence Layout, Enugu')).toBeNull();
  });

  it('returns null for a non-Google URL, even one with a similar-looking @lat,lng pattern', () => {
    expect(parseGoogleMapsUrl('https://evil.example.com/@6.45,3.39,15z')).toBeNull();
  });

  it('rejects out-of-range values rather than returning garbage coordinates', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/@200,3.39,15z')).toBeNull();
  });
});
