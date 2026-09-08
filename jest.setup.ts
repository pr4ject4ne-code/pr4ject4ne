import '@testing-library/jest-dom';
import { randomUUID } from 'node:crypto';

// jsdom's global `crypto` (when present at all) doesn't implement
// randomUUID, so any component using crypto.randomUUID() client-side (e.g.
// HospitalDashboardClient's department ids, BioDataForm's clinical-condition
// ids) throws in tests. Node's real implementation is right there — just
// wire it in rather than mocking a fake UUID generator per test file.
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - minimal shape, only what components in this repo use
  globalThis.crypto = { randomUUID };
} else if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = randomUUID;
}

// jsdom doesn't implement scrollIntoView at all (it's a rendering/layout API
// jsdom has no concept of), so any component that calls it — e.g.
// ErrorBubble's banner variant self-scrolling into view — throws in tests.
// Stub it so effects that call it don't crash; the actual scroll behavior is
// a real-browser concern, not something jsdom can meaningfully assert on.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}
