import { describe, it, expect } from 'vitest'
import { SESSIONS, TABATA, segmentsFor, sessionSeconds, firstPendingIndex, clock } from './tabata.js'
import { EXIDX } from './exercises.js'

describe('kettlebell Tabata sessions', () => {
  it('ships eight sessions of four or five exercises', () => {
    expect(SESSIONS).toHaveLength(8)
    for (const s of SESSIONS) {
      expect(s.ex.length, s.name).toBeGreaterThanOrEqual(4)
      expect(s.ex.length, s.name).toBeLessThanOrEqual(5)
    }
  })

  it('only uses exercises that exist and are kettlebell work', () => {
    for (const s of SESSIONS) {
      for (const id of s.ex) {
        expect(EXIDX[id], `${s.name}: ${id}`).toBeTruthy()
        expect(EXIDX[id].eq, `${s.name}: ${EXIDX[id].n}`).toBe('kettlebell')
      }
    }
  })

  it('lands inside the advertised 15–25 minute window', () => {
    for (const s of SESSIONS) {
      const mins = sessionSeconds(s.ex.length) / 60
      expect(mins, s.name).toBeGreaterThanOrEqual(15)
      expect(mins, s.name).toBeLessThanOrEqual(25)
    }
  })
})

describe('segmentsFor', () => {
  it('opens with a get-ready countdown', () => {
    expect(segmentsFor(1)[0]).toMatchObject({ kind: 'prep', sec: TABATA.prep })
  })

  it('walks 8 work intervals per exercise with short rests and one long break between', () => {
    const segs = segmentsFor(2, { ...TABATA, prep: 0 })
    expect(segs.filter(s => s.kind === 'work')).toHaveLength(16)
    expect(segs.filter(s => s.kind === 'rest')).toHaveLength(15)
    expect(segs[0]).toMatchObject({ kind: 'work', e: 0, round: 1, sec: 20 })
    expect(segs[1]).toMatchObject({ kind: 'rest', e: 0, round: 1, sec: 10, long: false })
    // the last work of the first exercise is followed by the break, not a 10 s rest
    const lastOfFirst = segs.findIndex(s => s.kind === 'work' && s.e === 0 && s.round === 8)
    expect(segs[lastOfFirst + 1]).toMatchObject({ kind: 'rest', sec: TABATA.between, long: true })
    // and the session ends on work, with no trailing rest
    expect(segs.at(-1)).toMatchObject({ kind: 'work', e: 1, round: 8 })
  })

  it('adds up to the session length it reports', () => {
    const segs = segmentsFor(4)
    expect(sessionSeconds(4)).toBe(segs.reduce((n, s) => n + s.sec, 0))
  })
})

describe('firstPendingIndex', () => {
  const segs = segmentsFor(1)
  const entries = [{ sets: Array.from({ length: 8 }, () => ({ done: false })) }]

  it('starts at the prepare countdown when nothing is logged', () => {
    expect(firstPendingIndex(segs, entries)).toBe(0)
  })

  it('resumes at the first interval whose set is still open', () => {
    entries[0].sets[0].done = true
    entries[0].sets[1].done = true
    const i = firstPendingIndex(segs, entries)
    expect(segs[i]).toMatchObject({ kind: 'work', e: 0, round: 3 })
  })

  it('reports the end when every set is logged', () => {
    entries[0].sets.forEach(s => { s.done = true })
    expect(firstPendingIndex(segs, entries)).toBe(segs.length)
  })
})

describe('clock', () => {
  it('formats seconds as m:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65)).toBe('1:05')
    expect(clock(-4)).toBe('0:00')
  })
})
