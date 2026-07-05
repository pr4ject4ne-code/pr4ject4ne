'use client';

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Browser geolocation wrapper. Resolves to coordinates, or rejects with a
 * human-readable reason so the UI can fall back to manual entry. Never tracks
 * without the user's explicit permission (the browser prompt gates it).
 */
export function getCurrentPosition(timeoutMs = 10000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enter your location manually.'
            : 'Could not determine your location. Enter it manually.';
        reject(new Error(reason));
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

/** Enugu city center — sensible default when geolocation is unavailable. */
export const DEFAULT_CENTER: Coords = { lat: 6.4584, lng: 7.5464 };
