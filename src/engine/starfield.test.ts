import { describe, expect, test } from 'vitest'
import { DrawList } from './drawList.ts'
import { hash01 } from './layout.ts'
import { SpatialGrid } from './spatialGrid.ts'

const identity = (v: number) => v
const bounds = { left: 0, top: 0, right: 100, bottom: 100 }

describe('DrawList', () => {
  test('skips films outside the mask and outside the plot', () => {
    const list = new DrawList(4)
    const mask = Uint8Array.from([1, 0, 1, 1])
    const xs = [10, 20, 30, 500]
    const ys = [10, 20, 30, 30]
    list.build(mask, xs, ys, identity, identity, bounds)
    expect(Array.from(list.idx.subarray(0, list.n))).toEqual([0, 2])
  })

  test('overplotting: the first film in a cell wins', () => {
    const list = new DrawList(3)
    const mask = Uint8Array.from([1, 1, 1])
    // films 0 and 1 land in the same 6x3 cell, film 2 is far away
    list.build(mask, [10, 11, 60], [10, 10.5, 60], identity, identity, bounds)
    expect(Array.from(list.idx.subarray(0, list.n))).toEqual([0, 2])
  })

  test('zooming in separates films that overlapped', () => {
    const list = new DrawList(2)
    const mask = Uint8Array.from([1, 1])
    const xs = [10, 11]
    const ys = [10, 10]
    list.build(mask, xs, ys, identity, identity, bounds)
    expect(list.n).toBe(1)
    list.build(mask, xs, ys, (v) => v * 4 - 30, identity, bounds)
    expect(list.n).toBe(2)
  })

  test('dedupe can be disabled', () => {
    const list = new DrawList(2)
    list.build(
      Uint8Array.from([1, 1]),
      [10, 10],
      [10, 10],
      identity,
      identity,
      bounds,
      false,
    )
    expect(list.n).toBe(2)
  })

  test('repeated builds do not leak occupancy between frames', () => {
    const list = new DrawList(1)
    const args = [
      Uint8Array.from([1]),
      [10],
      [10],
      identity,
      identity,
      bounds,
    ] as const
    list.build(...args)
    list.build(...args)
    expect(list.n).toBe(1)
  })
})

describe('SpatialGrid', () => {
  const ids = Int32Array.from([7, 8, 9])
  const xs = Float32Array.from([10, 50, 52])
  const ys = Float32Array.from([10, 50, 50])
  const grid = new SpatialGrid(12)
  grid.build(100, 100, 3, ids, xs, ys)

  test('finds the nearest star within the radius', () => {
    expect(grid.nearest(11, 11, 6)).toBe(7)
    expect(grid.nearest(51.5, 50, 6)).toBe(9)
    expect(grid.nearest(50.5, 50, 6)).toBe(8)
  })

  test('returns -1 when nothing is close', () => {
    expect(grid.nearest(90, 90, 6)).toBe(-1)
  })

  test('finds stars across cell borders', () => {
    // star at x=50 is in cell 4 (48-60); pointer at 47 is in cell 3
    expect(grid.nearest(47, 50, 6)).toBe(8)
  })

  test('matches brute force on random points', () => {
    const n = 500
    const rx = new Float32Array(n)
    const ry = new Float32Array(n)
    const rid = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      rx[i] = hash01(i) * 300
      ry[i] = hash01(i + 9999) * 200
      rid[i] = i
    }
    const g = new SpatialGrid(12)
    g.build(300, 200, n, rid, rx, ry)
    for (let t = 0; t < 200; t++) {
      const x = hash01(t + 50_000) * 300
      const y = hash01(t + 60_000) * 200
      let best = -1
      let bestD = 36
      for (let i = 0; i < n; i++) {
        const d = (rx[i]! - x) ** 2 + (ry[i]! - y) ** 2
        if (d <= bestD) {
          bestD = d
          best = i
        }
      }
      expect(g.nearest(x, y, 6)).toBe(best)
    }
  })
})

describe('hash01', () => {
  test('is deterministic and within [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = hash01(i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      expect(hash01(i)).toBe(v)
    }
  })
})
