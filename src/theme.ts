// Party Spy's design system: one place for colours, fonts and shapes, so every
// screen looks like the same game. "Candy clay": a soft blush background,
// puffy white cards and chunky party-coloured buttons that look like
// squeezable clay (thick borders, a solid bottom edge and soft shadows).
// Nunito for headings, DM Sans for reading text. Full design notes live in
// design-system/party-spy/MASTER.md.
//
// Contrast (WCAG): text and muted pass 4.5:1 on every background; `dim` is
// only for large or decorative text. Dark `onAccent` text passes on every
// party colour.

export const THEME = {
  // Backgrounds, from the page down to raised cards.
  bgTop: '#FFF6FB',
  bg: '#FDF2F8',
  bgDeep: '#F9E3F0',
  surface: '#FFFFFF',
  surfaceHi: '#FFF8FC',
  surfaceLo: '#F6E6F0',
  line: '#F1DAE8',
  lineStrong: '#E4C2D7',
  scrim: 'rgba(42,18,64,0.45)',

  // Text.
  text: '#2A1240',
  muted: '#6B5880',
  dim: '#8C7AA3',
  // Text on the bright party colours.
  onAccent: '#2A1240',

  // Party colours. Each has an "edge": the darker clay underside of buttons/tiles.
  yellow: '#FFC93C',
  yellowEdge: '#E0A100',
  pink: '#FF7AB8',
  pinkEdge: '#E0458F',
  lime: '#A3E635',
  limeEdge: '#6FAE14',
  cyan: '#5EE0F5',
  cyanEdge: '#1BAFCB',
  orange: '#FFAA6B',
  orangeEdge: '#E8752A',
  violet: '#C3A8FF',
  violetEdge: '#8E62F0',

  // Party colours deep enough for text and icons on light backgrounds
  // (4.5:1 or better on bg, surface and surfaceLo).
  yellowText: '#8F5600',
  pinkText: '#BE185D',
  limeText: '#3F6212',
  cyanText: '#0B6577',
  orangeText: '#B23B0B',
  violetText: '#6D28D9',

  // Brand accents.
  primary: '#BE185D',
  secondary: '#6D28D9',

  // Feedback (text-safe on light backgrounds).
  good: '#15803D',
  bad: '#C62828',
  goodSoft: '#DCFCE7',
  badSoft: '#FFE1E1',
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

// Static font families: pick the weight by name (fontWeight isn't used).
// regular/medium are DM Sans (reading text); semi/bold/black are Nunito
// (labels and headings).
export const FONTS = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semi: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
};

export const RADIUS = { sm: 14, md: 20, lg: 26, pill: 999 };

// Clay depth: the solid "underside" height of buttons and tiles, and the soft
// shadows that make cards look puffy. boxShadow works on Android, iOS and web.
export const CLAY = {
  edge: 6,
  border: 3,
  card: '0px 10px 24px rgba(190, 24, 93, 0.10), inset 0px -4px 0px rgba(190, 24, 93, 0.05)',
  raised: '0px 14px 30px rgba(109, 40, 217, 0.16), inset 0px -4px 0px rgba(42, 18, 64, 0.06)',
  // Glossy highlight on top of coloured clay.
  gloss: 'inset 0px 3px 0px rgba(255, 255, 255, 0.55), inset 0px -3px 0px rgba(42, 18, 64, 0.10)',
};
