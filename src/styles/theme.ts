/**
 * Theme tokens (TypeScript mirror of the CSS variables in globals.css).
 * Use the CSS variables in components; this file is for logic that needs the
 * values in JS (e.g. Leaflet marker colors, chart palettes).
 *
 * Rules: matte finish, no gradients into white, no blue/amethyst text directly
 * on a white background.
 */
export const theme = {
  colors: {
    blue: '#2b4a7e',
    blueDark: '#1e3357',
    blueLight: '#e8edf5',
    amethyst: '#6b4c8a',
    amethystDark: '#4e3766',
    amethystLight: '#efeaf5',
    white: '#ffffff',
    offWhite: '#f7f8fa',
    ink: '#1c1f26',
    muted: '#5a6172',
    border: '#d7dce4',
    green: '#2e7d4f',
    yellow: '#b8860b',
    red: '#b3261e',
  },
  fontSans: `system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
} as const;

export type AnnouncementColorName = 'green' | 'yellow' | 'red';

export const announcementColor: Record<AnnouncementColorName, string> = {
  green: theme.colors.green,
  yellow: theme.colors.yellow,
  red: theme.colors.red,
};
