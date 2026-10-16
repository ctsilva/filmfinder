export interface Point {
  x: number
  y: number
}
export interface Size {
  w: number
  h: number
}

const GAP = 14

/**
 * Top-left corner for a card next to a star: right of and below it by default,
 * flipped to the other side when that would overflow the container, and
 * finally clamped so the card is never cut off while the container is big enough.
 */
export function placeCard(anchor: Point, container: Size, card: Size): Point {
  let x = anchor.x + GAP
  if (x + card.w > container.w) x = anchor.x - GAP - card.w
  let y = anchor.y + GAP
  if (y + card.h > container.h) y = anchor.y - GAP - card.h
  return {
    x: Math.max(0, Math.min(x, container.w - card.w)),
    y: Math.max(0, Math.min(y, container.h - card.h)),
  }
}
