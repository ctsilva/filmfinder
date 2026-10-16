/**
 * Genre colors on the dark background. Index matches primaryGenre / genreMask bits
 * (9 = other). Mostly the Okabe-Ito colorblind-safe palette; checked properly in Milestone 8.
 */
export const GENRE_COLORS = [
  '#56B4E9', // Drama
  '#F0E442', // Comedy
  '#D55E00', // Action
  '#CC79A7', // Romance
  '#B39DDB', // Horror
  '#009E73', // Sci-Fi
  '#E69F00', // Mystery
  '#FFFFFF', // Documentary
  '#8DD3C7', // Animation
  '#7C8594', // Other
] as const

export const OTHER_GENRE_NAME = 'Other'
