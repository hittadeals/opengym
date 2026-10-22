// Kettlebell Tabata sessions and the interval timeline behind the player.
//
// Format follows the original Tabata protocol (20 s work / 10 s rest, 8 rounds) and the way
// kettlebell apps such as Kettlebell Lab and the classic Tabata timers structure a session:
// one 4-minute block per exercise, a longer break between exercises, and a short get-ready
// countdown before the first interval. Eight sessions of four to five exercises land between
// 17 and 24 minutes, which is the 15–25 minute window the sessions are designed for.
import { EXIDX } from './exercises.js'

export const TABATA = { work: 20, rest: 10, rounds: 8, between: 60, prep: 10 }

// Eight sessions, each built only from exercises in the catalogue whose equipment is
// "kettlebell". `note` is shown in the session list and carries the one coaching cue that
// matters for that selection (sides, pace, or load).
export const SESSIONS = [
  {
    id: 'full-body-foundations',
    name: 'Full Body Foundations',
    focus: 'Full body',
    note: 'Start here. One bell, crisp reps, and stop the set before the hinge turns into a squat.',
    ex: ['0534', '0549', '0522', '0553']
  },
  {
    id: 'upper-body-power',
    name: 'Upper Body Power',
    focus: 'Upper body',
    note: 'Alternate sides on the press and the row: one round left, the next round right.',
    ex: ['0520', '0541', '0535', '0523']
  },
  {
    id: 'lower-body-burn',
    name: 'Lower Body Burn',
    focus: 'Lower body',
    note: 'Keep the bell close and the knees tracking over the toes, even as the rest gets short.',
    ex: ['0534', '0533', '0549', '0536']
  },
  {
    id: 'posterior-chain',
    name: 'Posterior Chain',
    focus: 'Hinge & back',
    note: 'Hips, not arms. Every swing and high pull starts with a hard snap of the glutes.',
    ex: ['0549', '0548', '0552', '1345']
  },
  {
    id: 'push-day',
    name: 'Push Day',
    focus: 'Chest & shoulders',
    note: 'Use a lighter bell than your strength work — the press has to stay smooth for 20 seconds.',
    ex: ['0553', '0540', '1298', '0545']
  },
  {
    id: 'pull-day',
    name: 'Pull Day',
    focus: 'Back & grip',
    note: 'Switch arms each round on the rows. If the grip fades, set the bell down for a second.',
    ex: ['0541', '0521', '0552', '0548']
  },
  {
    id: 'core-and-control',
    name: 'Core & Control',
    focus: 'Core',
    note: 'Slow is fine. These four reward control and a stable shoulder more than speed.',
    ex: ['0532', '0554', '0524', '0551']
  },
  {
    id: 'full-body-conditioning',
    name: 'Full Body Conditioning',
    focus: 'Conditioning',
    note: 'The hardest session of the eight. Five exercises, one bell, and 20 seconds to work.',
    ex: ['0549', '0550', '0542', '0548', '0534']
  }
]

export const sessionById = id => SESSIONS.find(s => s.id === id) || null

// The whole session as one flat list of segments. Keeping the timeline pure (no React, no
// timers) means the player only has to walk an array, and the shape is easy to test.
//
//   prep   — the get-ready countdown before the first interval
//   work   — one exercise, `round` of `rounds`
//   rest   — after a work interval; `long` marks the break between two exercises
export function segmentsFor(count, cfg = TABATA) {
  const out = []
  if (cfg.prep > 0) out.push({ kind: 'prep', sec: cfg.prep })
  for (let e = 0; e < count; e++) {
    for (let r = 0; r < cfg.rounds; r++) {
      out.push({ kind: 'work', e, round: r + 1, sec: cfg.work })
      const lastWork = e === count - 1 && r === cfg.rounds - 1
      if (lastWork) break
      const long = r === cfg.rounds - 1
      out.push({ kind: 'rest', e, round: r + 1, sec: long ? cfg.between : cfg.rest, long })
    }
  }
  return out
}

// Total wall-clock length of a session, including the get-ready countdown.
export function sessionSeconds(count, cfg = TABATA) {
  return segmentsFor(count, cfg).reduce((n, s) => n + s.sec, 0)
}

// Where a reloaded session should resume: the first work interval whose set is not logged.
// The get-ready countdown is only repeated when nothing has been logged at all.
export function firstPendingIndex(segments, entries) {
  const anyDone = entries.some(e => (e.sets || []).some(s => s.done))
  if (!anyDone) return 0
  const i = segments.findIndex(s => s.kind === 'work' && !(entries[s.e]?.sets?.[s.round - 1]?.done))
  return i < 0 ? segments.length : i
}

// mm:ss, the same notation the rest of the app uses for durations.
export function clock(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')
}

// Exercise records for a session, in order. Unknown ids are dropped rather than rendered as
// a placeholder mid-interval.
export const exercisesOf = session => (session ? session.ex.map(id => EXIDX[id]).filter(Boolean) : [])
