// Starting a Tabata session mutates the same active workout a normal session uses, so
// history, the calendar and the finish summary keep working unchanged.
import { useStore } from '../store/useStore.js'
import { uid, todayISO } from './format.js'
import { TABATA, slotsOf } from './tabata.js'

export function buildTabataActive(session) {
  const rounds = session.rounds
  const entries = session.ex.map(item => {
    const sets = rounds * slotsOf(item)
    return {
      id: item.id,
      sides: item.sides,
      target: { id: item.id, mode: 'time', sec: TABATA.work, sets, weight: 0 },
      sets: Array.from({ length: sets }, () => ({ sec: TABATA.work, w: 0, done: false }))
    }
  })
  return {
    id: uid(), d: todayISO(), start: Date.now(), routineId: null,
    name: `Tabata · ${session.name}`, bw: null, cur: 0, entries,
    tabata: { ...TABATA, rounds, id: session.id, name: session.name }
  }
}

export function startTabata(session) {
  if (!session) return null
  const active = buildTabataActive(session)
  useStore.getState().update(s => { s.active = active })
  return active
}
