// Kettlebell Tabata sessions and the interval timeline behind the player.
//
// One kettlebell only, and unilateral lifts are worked one arm at a time: a two-sided
// exercise expands to a left interval followed by a right interval, so the next thing the
// clock gives you is the other arm. Bilateral lifts (goblet squat, swing, thruster) use the
// same single bell with both hands.
//
// Format: 20 s work / 10 s rest, a circuit round visits every exercise, then a 45 s break.
// Rounds and exercise count are per session so every pass lands between 15 and 25 minutes.
import { EXIDX } from './exercises.js'

export const TABATA = { work: 20, rest: 10, rounds: 8, between: 45, prep: 10 }

const ex = (id, sides) => ({ id, sides: sides || 'both' })
const each = id => ex(id, 'each')

// Eight sessions, built only from kettlebell exercises. `sides: 'each'` means the movement
// is unilateral and becomes two consecutive intervals (left, right) in every round.
export const SESSIONS = [
  {
    id: 'full-body-foundations',
    name: 'Full Body Foundations',
    focus: 'Full body',
    level: 'Beginner',
    rounds: 6,
    note: 'Start here. One bell, crisp reps, and stop before the hinge turns into a squat. Row one arm at a time.',
    ex: [ex('0534'), each('0541'), ex('0523'), ex('0549')]
  },
  {
    id: 'lower-body-burn',
    name: 'Lower Body Burn',
    focus: 'Lower body',
    level: 'Intermediate',
    rounds: 8,
    note: 'Same bell throughout. Step through under control on the lunge pass-through and switch the leading leg each round.',
    ex: [ex('0534'), ex('0533'), ex('0549'), ex('0536')]
  },
  {
    id: 'upper-body-power',
    name: 'Upper Body Power',
    focus: 'Upper body',
    level: 'Intermediate',
    rounds: 6,
    note: 'Left arm, then right arm, back to back. Same bell for the press, the row and the clean.',
    ex: [each('0539'), each('0541'), each('0535'), ex('0523')]
  },
  {
    id: 'posterior-chain',
    name: 'Posterior Chain',
    focus: 'Hinge & back',
    level: 'Intermediate',
    rounds: 6,
    note: 'Hips, not arms. Two-hand swing and high pull on one bell; the clean and row switch arms between intervals.',
    ex: [ex('0549'), ex('0548'), each('0535'), each('0541')]
  },
  {
    id: 'push-day',
    name: 'Push Day',
    focus: 'Chest & shoulders',
    level: 'Intermediate',
    rounds: 5,
    note: 'One arm at a time on all three presses — left interval, right interval. Use a lighter bell than your strength work.',
    ex: [each('0540'), each('1298'), each('0539'), ex('0523')]
  },
  {
    id: 'pull-day',
    name: 'Pull Day',
    focus: 'Back & grip',
    level: 'Intermediate',
    rounds: 6,
    note: 'The one-arm row and the clean switch arms between intervals. Two-hand work keeps the same single bell.',
    ex: [each('0541'), ex('1345'), ex('0548'), each('0535')]
  },
  {
    id: 'core-and-control',
    name: 'Core & Control',
    focus: 'Core',
    level: 'Advanced',
    rounds: 5,
    note: 'One bell, controlled tempo. The figure 8 passes hand to hand; the windmills and bent press alternate sides.',
    ex: [ex('0532'), each('0554'), each('0524'), each('0517')]
  },
  {
    id: 'full-body-conditioning',
    name: 'Full Body Conditioning',
    focus: 'Conditioning',
    level: 'Advanced',
    rounds: 6,
    note: 'The hardest pass. The snatch is one arm at a time and alternates; swap it for a clean if technique breaks.',
    ex: [ex('0549'), ex('0550'), each('0542'), ex('0548'), ex('0534')]
  }
]

export const sessionById = id => SESSIONS.find(s => s.id === id) || null

// How many work intervals one exercise gets per round: two for a unilateral movement.
export const slotsOf = e => (e.sides === 'each' ? 2 : 1)

// The whole session as one flat list of segments. Keeping the timeline pure (no React, no
// timers) means the player only has to walk an array, and the shape is easy to test.
//
//   prep   — the get-ready countdown before the first interval
//   work   — one exercise, `round` of `rounds`, `set` index in the entry, optional `side`
//   rest   — after a work interval; `long` marks the break between two rounds
//
// A round is: exercise 0 (left, right if unilateral), exercise 1, … then the break.
export function segmentsFor(entries, cfg = TABATA) {
  const out = []
  if (cfg.prep > 0) out.push({ kind: 'prep', sec: cfg.prep })
  for (let r = 0; r < cfg.rounds; r++) {
    for (let e = 0; e < entries.length; e++) {
      const sides = entries[e].sides === 'each' ? ['left', 'right'] : [null]
      for (let k = 0; k < sides.length; k++) {
        const set = r * sides.length + k
        out.push({ kind: 'work', e, round: r + 1, set, side: sides[k], sec: cfg.work })
        const endOfRound = e === entries.length - 1 && k === sides.length - 1
        const lastWork = r === cfg.rounds - 1 && endOfRound
        if (lastWork) break
        out.push({
          kind: 'rest', e, round: r + 1, set, side: sides[k],
          sec: endOfRound ? cfg.between : cfg.rest, long: endOfRound
        })
      }
    }
  }
  return out
}

// Total wall-clock length of a session, including the get-ready countdown.
export function sessionSeconds(session, cfg = TABATA) {
  return segmentsFor(session.ex, { ...cfg, rounds: session.rounds }).reduce((n, s) => n + s.sec, 0)
}

// Where a reloaded session should resume: the first work interval whose set is not logged.
// The get-ready countdown is only repeated when nothing has been logged at all.
export function firstPendingIndex(segments, entries) {
  const anyDone = entries.some(e => (e.sets || []).some(s => s.done))
  if (!anyDone) return 0
  const i = segments.findIndex(s => s.kind === 'work' && !(entries[s.e]?.sets?.[s.set]?.done))
  return i < 0 ? segments.length : i
}

// mm:ss, the same notation the rest of the app uses for durations.
export function clock(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')
}

// Exercise records for a session, in order. Unknown ids are dropped rather than rendered as
// a placeholder mid-interval.
export const exercisesOf = session => (session ? session.ex.map(x => EXIDX[x.id]).filter(Boolean) : [])
