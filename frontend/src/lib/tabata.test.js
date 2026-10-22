import { describe, it, expect } from 'vitest'
import { SESSIONS, TABATA, segmentsFor, sessionSeconds, firstPendingIndex, clock, slotsOf } from './tabata.js'
import { EXIDX } from './exercises.js'

const B = { sides: 'both' }
const E = { sides: 'each' }

describe('kettlebell Tabata sessions', () => {
  it('ships eight sessions of four or five exercises', () => {
    expect(SESSIONS).toHaveLength(8)
    for (const s of SESSIONS) {
      expect(s.ex.length, s.name).toBeGreaterThanOrEqual(4)
      expect(s.ex.length, s.name).toBeLessThanOrEqual(5)
      expect(s.rounds, s.name).toBeGreaterThanOrEqual(4)
    }
  })

  it('only uses exercises that exist and are kettlebell work', () => {
    for (const s of SESSIONS) {
      for (const item of s.ex) {
        expect(EXIDX[item.id], `${s.name}: ${item.id}`).toBeTruthy()
        expect(EXIDX[item.id].eq, `${s.name}: ${EXIDX[item.id].n}`).toBe('kettlebell')
        expect(['both', 'each']).toContain(item.sides)
      }
    }
  })

  it('lands inside the advertised 15–25 minute window', () => {
    for (const s of SESSIONS) {
      const mins = sessionSeconds(s) / 60
      expect(mins, s.name).toBeGreaterThanOrEqual(15)
      expect(mins, s.name).toBeLessThanOrEqual(25)
    }
  })
})

describe('segmentsFor', () => {
  it('opens with a get-ready countdown', () => {
    expect(segmentsFor([B])[0]).toMatchObject({ kind: 'prep', sec: TABATA.prep })
  })

  it('rotates exercises inside every round', () => {
    const segs = segmentsFor([B, B], { ...TABATA, prep: 0, rounds: 2 })
    expect(segs.filter(s => s.kind === 'work').map(s => `${s.e}:${s.round}`))
      .toEqual(['0:1', '1:1', '0:2', '1:2'])
    expect(segs.filter(s => s.long).map(s => `${s.e}:${s.round}`)).toEqual(['1:1'])
  })

  it('splits a unilateral exercise into back-to-back left and right intervals', () => {
    const segs = segmentsFor([B, E, B], { ...TABATA, prep: 0, rounds: 2 })
    const firstRound = segs.filter(s => s.kind === 'work' && s.round === 1)
    expect(firstRound.map(s => `${s.e}:${s.side}:${s.set}`)).toEqual([
      '0:null:0', '1:left:0', '1:right:1', '2:null:0'
    ])
    // the break comes after the last interval of the round, not between the arms
    expect(segs.find(s => s.long)).toMatchObject({ e: 2, round: 1 })
  })

  it('gives each exercise the right number of sets per round', () => {
    expect(slotsOf(B)).toBe(1)
    expect(slotsOf(E)).toBe(2)
    const segs = segmentsFor([B, E], { ...TABATA, prep: 0, rounds: 3 })
    const lastFor = e => segs.filter(s => s.kind === 'work' && s.e === e).at(-1)
    expect(lastFor(0).set).toBe(2)   // 3 rounds × 1
    expect(lastFor(1).set).toBe(5)   // 3 rounds × 2
  })

  it('adds up to the session length it reports', () => {
    const s = SESSIONS[0]
    const cfg = { ...TABATA, rounds: s.rounds }
    expect(sessionSeconds(s)).toBe(segmentsFor(s.ex, cfg).reduce((n, x) => n + x.sec, 0))
  })
})

describe('firstPendingIndex', () => {
  const segs = segmentsFor([E], { ...TABATA, prep: 0, rounds: 2 })
  const entries = [{ sets: Array.from({ length: 4 }, () => ({ done: false })) }]

  it('starts at the prepare countdown when nothing is logged', () => {
    expect(firstPendingIndex(segmentsFor([E], { ...TABATA, rounds: 2 }), entries)).toBe(0)
  })

  it('resumes at the first interval whose set is still open', () => {
    entries[0].sets[0].done = true
    entries[0].sets[1].done = true
    const i = firstPendingIndex(segs, entries)
    expect(segs[i]).toMatchObject({ kind: 'work', e: 0, round: 2, side: 'left', set: 2 })
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
