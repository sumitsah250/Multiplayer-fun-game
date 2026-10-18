// Party Spy's design system: one place for colours, fonts and shapes, so every
// screen looks like the same game. "Party night": deep violet with bright
// party colours, chunky rounded shapes, and the Baloo 2 typeface (playful, and
// it covers Devanagari for Hindi and Nepali missions).

export const THEME = {
  // Backgrounds, from the page down to raised cards.
  bgTop: '#2A0E6E',
  bg: '#1D0B4E',
  bgDeep: '#130733',
  surface: '#2E1670',
  surfaceHi: '#3C2088',
  surfaceLo: '#24105C',
  line: 'rgba(255,255,255,0.13)',
  lineStrong: 'rgba(255,255,255,0.26)',
  scrim: 'rgba(10,3,30,0.62)',

  // Text on the dark backgrounds.
  text: '#FFFFFF',
  muted: '#CBBDF5',
  dim: '#9A87D8',
  // Text on the bright accent colours.
  onAccent: '#1D0B4E',

  // Party colours. Each has an "edge" (the darker 3D bottom of buttons/tiles).
  yellow: '#FFD23F',
  yellowEdge: '#C79600',
  pink: '#FF4FA3',
  pinkEdge: '#BD1C6E',
  lime: '#B8F35A',
  limeEdge: '#78AE1F',
  cyan: '#3DDCFF',
  cyanEdge: '#0C9CC2',
  orange: '#FF8A4C',
  orangeEdge: '#C4561C',
  violet: '#9B6BFF',
  violetEdge: '#6435D6',

  // Feedback.
  good: '#47E58F',
  bad: '#FF5C6C',
};

export type Tone = 'yellow' | 'pink' | 'lime' | 'cyan' | 'orange' | 'violet';

export const TONE_COLORS: Record<Tone, { face: string; edge: string }> = {
  yellow: { face: THEME.yellow, edge: THEME.yellowEdge },
  pink: { face: THEME.pink, edge: THEME.pinkEdge },
  lime: { face: THEME.lime, edge: THEME.limeEdge },
  cyan: { face: THEME.cyan, edge: THEME.cyanEdge },
  orange: { face: THEME.orange, edge: THEME.orangeEdge },
  violet: { face: THEME.violet, edge: THEME.violetEdge },
};

// A cycle of tones for lists (players, categories) so they stay colourful.
export const TONE_CYCLE: Tone[] = ['yellow', 'pink', 'cyan', 'lime', 'orange', 'violet'];

// Baloo 2 is a static family: pick the weight by name (fontWeight isn't used).
export const FONTS = {
  regular: 'Baloo2_400Regular',
  medium: 'Baloo2_500Medium',
  semi: 'Baloo2_600SemiBold',
  bold: 'Baloo2_700Bold',
  black: 'Baloo2_800ExtraBold',
};

export const RADIUS = { sm: 12, md: 18, lg: 24, pill: 999 };
