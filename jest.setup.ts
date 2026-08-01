import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView at all (it's a rendering/layout API
// jsdom has no concept of), so any component that calls it — e.g.
// ErrorBubble's banner variant self-scrolling into view — throws in tests.
// Stub it so effects that call it don't crash; the actual scroll behavior is
// a real-browser concern, not something jsdom can meaningfully assert on.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}
