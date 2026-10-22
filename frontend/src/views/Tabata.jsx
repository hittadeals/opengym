import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { uid, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { beep, vibrate, unlockAudio } from '../lib/sound.js'
import { fullscreenSupported, fullscreenElement, enterFullscreen, exitFullscreen, onFullscreenChange } from '../lib/fullscreen.js'
import { SESSIONS, TABATA, segmentsFor, sessionSeconds, firstPendingIndex, clock } from '../lib/tabata.js'
import { confirmSheet, finishWorkout } from '../sheets.jsx'
import Media, { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

const soundOn = () => useStore.getState().S.sound

// Transition cues. Work gets a rising pair, rest a single low note, and the end a triad —
// the same vocabulary the rest timer uses, so the app sounds like one app.
function cue(kind) {
  const on = soundOn()
  if (kind === 'work') { beep(on, 880, 0.12); beep(on, 1180, 0.2, 0.13); vibrate(45) }
  else if (kind === 'rest') { beep(on, 520, 0.18); vibrate(25) }
  else if (kind === 'prep') beep(on, 660, 0.1)
  else if (kind === 'done') {
    beep(on, 880, 0.15); beep(on, 1100, 0.15, 0.2); beep(on, 1320, 0.45, 0.38)
    vibrate([200, 100, 200])
  }
}
// The five-second warning is deliberately different from the last-three beeps: one double
// note to pick the bell up, then a tick for each of the final seconds.
function warning(sec) {
  const on = soundOn()
  if (sec === 5) { beep(on, 740, 0.09); beep(on, 740, 0.09, 0.16) }
  else beep(on, 660, 0.08)
}

function startSession(session) {
  const work = TABATA.work
  const entries = session.ex.map(id => ({
    id,
    target: { id, mode: 'time', sec: work, sets: TABATA.rounds, weight: 0 },
    sets: Array.from({ length: TABATA.rounds }, () => ({ sec: work, w: 0, done: false }))
  }))
  useStore.getState().update(s => {
    s.active = {
      id: uid(), d: todayISO(), start: Date.now(), routineId: null,
      name: t('Tabata · {0}', session.name), bw: null, cur: 0, entries,
      tabata: { ...TABATA, id: session.id, name: session.name }
    }
  })
  useUI.getState().stopRest()
  useUI.getState().stopWork()
}

/* ------------------------------- session list ------------------------------- */

export default function Tabata() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const active = S.active

  if (active?.tabata) return <Navigate to="/tabata/play" replace />

  const begin = session => {
    const go = () => {
      // Both must happen inside the tap: the audio context needs a gesture, and fullscreen
      // is only granted from one too.
      unlockAudio()
      enterFullscreen()
      startSession(session)
      nav('/tabata/play')
    }
    if (active) {
      confirmSheet({
        title: t('Discard workout?'),
        message: t('The sets you logged in this session will be lost.'),
        confirmText: t('Discard'), danger: true, onConfirm: go
      })
      return
    }
    go()
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/workout')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, margin: '0 12px' }}>
        <div style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.021em' }}>{t('Kettlebell Tabata')}</div>
        <div className="sub">{t('8 sessions · 15–25 min · 20s work / 10s rest')}</div>
      </div>
      <span className="lrow-i" style={{ color: 'var(--acc)' }}><Icon name="kettlebell" /></span>
    </div>

    <div className="card" style={{ marginTop: 0 }}>
      <div className="small muted" style={{ lineHeight: 1.5 }}>
        {t('One kettlebell, a circuit of eight rounds, and a clock that tells you when to work, when to rest and which exercise is next. Every session logs like a normal workout.')}
      </div>
    </div>

    <div className="list">
      {SESSIONS.map(session => {
        const mins = Math.round(sessionSeconds(session.ex.length) / 60)
        return <div key={session.id} className="item" onClick={() => begin(session)} style={{ alignItems: 'flex-start' }}>
          <span className="lrow-i" style={{ marginTop: 2 }}><Icon name="kettlebell" /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row between" style={{ gap: 8 }}>
              <div className="tt">{session.name}</div>
              <span className="tag">{t(session.level)}</span>
            </div>
            <div className="ss">{t(session.focus)} · {t('{0} exercises · {1} rounds', session.ex.length, 8)} · ~{mins} min</div>
            <div className="tb-thumbs">
              {session.ex.map(id => {
                const e = exOr(id)
                return <span className="tb-thumb" key={id} title={e.n}><Thumb ex={e} /></span>
              })}
            </div>
            <div className="tb-includes">{session.ex.map(id => exOr(id).n).join(' · ')}</div>
            <div className="small dim tb-note">{session.note}</div>
          </div>
          <span className="tag acc">{t('Start')}</span>
        </div>
      })}
    </div>
    <div style={{ height: 24 }} />
  </div>
}

/* -------------------------------- the player -------------------------------- */

export function TabataPlayer() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const A = S.active
  const tabata = A?.tabata

  // Hooks must run unconditionally; the guard sits after them.
  const segs = useMemo(() => (A && tabata ? segmentsFor(A.entries.length, tabata) : []), [A?.entries.length, tabata?.id])
  const total = useMemo(() => segs.reduce((n, s) => n + s.sec, 0), [segs])
  const [startIdx] = useState(() => (A && tabata ? firstPendingIndex(segs, A.entries) : 0))
  const [idx, setIdx] = useState(() => Math.min(startIdx, segs.length))
  const [left, setLeft] = useState(() => (segs[startIdx]?.sec || 0) * 1000)
  const [paused, setPaused] = useState(startIdx >= segs.length)
  const [done, setDone] = useState(startIdx >= segs.length)

  const remaining = useRef((segs[startIdx]?.sec || 0) * 1000)
  const endAt = useRef(0)
  const lastSec = useRef(Math.ceil((segs[startIdx]?.sec || 0)))

  // The player owns the clock, so any bar left over from the normal workout has to go.
  // Fullscreen is released when the player really unmounts (the 50 ms delay avoids the
  // StrictMode mount/unmount/mount cycle in development).
  const [fs, setFs] = useState(!!fullscreenElement())
  const mounted = useRef(false)
  useEffect(() => {
    useUI.getState().stopRest()
    useUI.getState().stopWork()
    mounted.current = true
    const off = onFullscreenChange(() => setFs(!!fullscreenElement()))
    return () => {
      off()
      mounted.current = false
      setTimeout(() => { if (!mounted.current) exitFullscreen() }, 50)
    }
  }, [])

  const toggleSound = async () => {
    const next = !S.sound
    useStore.getState().update(s => { s.sound = next })
    if (next) { await unlockAudio(); beep(true, 880, 0.12); beep(true, 1180, 0.18, 0.13) }
  }

  function markDone(seg) {
    useStore.getState().update(s => {
      const set = s.active?.entries?.[seg.e]?.sets?.[seg.round - 1]
      if (set && !set.done) { set.done = true; set.sec = tabata.work }
    })
  }

  function advance() {
    const cur = segs[idx]
    if (!cur) return
    if (cur.kind === 'work') markDone(cur)
    const next = idx + 1
    if (next >= segs.length) {
      setDone(true)
      setLeft(0)
      remaining.current = 0
      cue('done')
      return
    }
    remaining.current = segs[next].sec * 1000
    lastSec.current = Math.ceil(segs[next].sec)
    setIdx(next)
    setLeft(remaining.current)
    cue(segs[next].kind)
  }

  useEffect(() => {
    if (paused || done) return
    endAt.current = Date.now() + remaining.current
    let stopped = false
    const tick = () => {
      if (stopped) return
      const ms = Math.max(0, endAt.current - Date.now())
      remaining.current = ms
      setLeft(ms)
      const s = Math.ceil(ms / 1000)
      if (s !== lastSec.current) {
        lastSec.current = s
        if (s === 5) warning(5)
        else if (s > 0 && s <= 3) warning(s)
      }
      if (ms <= 0) { stopped = true; clearInterval(iv); advance() }
    }
    const iv = setInterval(tick, 100)
    document.addEventListener('visibilitychange', tick)
    return () => {
      stopped = true
      clearInterval(iv)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [idx, paused, done])

  if (!A || !tabata) return <Navigate to="/workout" replace />

  const leave = () => confirmSheet({
    title: t('Leave the session?'),
    message: t('The intervals you have logged are kept. Resume from Start when you are ready.'),
    confirmText: t('Leave'), onConfirm: () => nav('/workout')
  })

  const finish = () => { finishWorkout(); nav('/home') }

  // Freeze the clock at what is actually left. `endAt` is only set while the interval effect
  // is running, so a pause pressed between two segments falls back to the carried value
  // instead of zeroing the segment.
  const pauseNow = () => {
    const ms = endAt.current ? Math.max(0, endAt.current - Date.now()) : remaining.current
    remaining.current = ms
    setLeft(ms)
    setPaused(true)
  }

  if (done) {
    const rounds = A.entries.length * tabata.rounds
    return <div className="tabata-player">
      <div className="tb-done">
        <div className="tb-done-ico"><Icon name="trophy" /></div>
        <h1>{t('Session complete')}</h1>
        <div className="muted" style={{ marginBottom: 18 }}>{t('Every interval done — that is the whole session.')}</div>
        <div className="tiles">
          <div className="tile"><div className="l">{t('Duration')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{clock(total)}</div></div>
          <div className="tile"><div className="l">{t('Rounds')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{rounds}</div></div>
          <div className="tile"><div className="l">{t('Exercises')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{A.entries.length}</div></div>
          <div className="tile"><div className="l">{t('Work')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{clock(A.entries.length * tabata.rounds * tabata.work)}</div></div>
        </div>
        <div style={{ height: 18 }} />
        <Button variant="primary" icon="check" onClick={finish}>{t('Save workout')}</Button>
        <div style={{ height: 8 }} />
        <Button variant="ghost" className="dim" onClick={() => nav('/workout')}>{t('Review the sets first')}</Button>
      </div>
    </div>
  }

  const seg = segs[idx]
  const workSeg = seg.kind === 'work' ? seg : segs.slice(idx).find(s => s.kind === 'work')
  const entry = A.entries[workSeg?.e ?? 0]
  const ex = entry ? exOr(entry.id) : null
  const totalLeft = Math.max(0, left / 1000 + segs.slice(idx + 1).reduce((n, s) => n + s.sec, 0))
  const pct = total ? Math.max(0, Math.min(100, (1 - totalLeft / total) * 100)) : 0
  const secs = Math.ceil(left / 1000)
  const phase = seg.kind === 'prep' ? t('Get ready') : seg.kind === 'work' ? t('Work') : t('Rest')
  const big = clock(secs)
  const nextWorkSeg = seg.kind === 'work' ? segs.slice(idx + 1).find(s => s.kind === 'work') : null
  const nextLine = nextWorkSeg
    ? (nextWorkSeg.round !== workSeg?.round
        ? t('Next round: {0}', exOr(A.entries[nextWorkSeg.e].id).n)
        : t('Next: {0}', exOr(A.entries[nextWorkSeg.e].id).n))
    : null
  // One dot per exercise in the current circuit round: done, current, or still ahead.
  const circuitRound = workSeg?.round || 1
  const roundDots = A.entries.map((en, i) =>
    en.sets?.[circuitRound - 1]?.done ? 'done' : i === workSeg?.e ? 'on' : '')

  return <div className="tabata-player" data-phase={seg.kind}>
    <div className="tb-top">
      <button className="iconbtn" onClick={leave} aria-label={t('Leave the session')}><Icon name="xmark" /></button>
      <div className="tb-title">
        <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tabata.name}</div>
        <div className="sub">{t('{0} left', clock(totalLeft))}</div>
      </div>
      <div className="tb-tools">
        <button className="iconbtn" onClick={toggleSound} aria-label={S.sound ? t('Mute') : t('Enable sound')} title={S.sound ? t('Mute') : t('Enable sound')}>
          <Icon name={S.sound ? 'bell' : 'bellSlash'} />
        </button>
        {fullscreenSupported() && (
          <button className="iconbtn" onClick={() => (fs ? exitFullscreen() : enterFullscreen())}
            aria-label={fs ? t('Exit fullscreen') : t('Fullscreen')} title={fs ? t('Exit fullscreen') : t('Fullscreen')}>
            <Icon name={fs ? 'minimize' : 'expand'} />
          </button>
        )}
        <button className={'iconbtn' + (paused ? ' on-ss' : '')} onClick={() => {
          if (!paused) pauseNow(); else setPaused(false)
        }} aria-label={paused ? t('Resume') : t('Pause')}><Icon name={paused ? 'play' : 'pause'} /></button>
      </div>
    </div>

    {ex && <div className="tb-visual"><Media ex={ex} /></div>}

    <div className="tb-stage">
      <div className={'tb-phase ' + seg.kind} aria-live="polite">{phase}</div>
      <div className={'tb-clock' + (secs <= 5 && seg.kind !== 'prep' ? ' warn' : '')} aria-live="off">{big}</div>

      {seg.kind === 'rest' ? <>
        <div className="tb-label">{t('Next up')}</div>
        <div className="tb-ex">{ex ? ex.n : ''}</div>
        {workSeg && <div className="tb-round">{t('Round {0} of {1}', workSeg.round, tabata.rounds)}</div>}
      </> : <>
        <div className="tb-label">{seg.kind === 'prep' ? t('First exercise') : t('Exercise {0} of {1}', (workSeg?.e ?? 0) + 1, A.entries.length)}</div>
        <div className="tb-ex">{ex ? ex.n : ''}</div>
        <div className="tb-round">{t('Round {0} of {1}', workSeg?.round || 1, tabata.rounds)}</div>
        <div className="tb-dots">
          {roundDots.map((st, i) => <i key={i} className={st} />)}
        </div>
        {nextLine && <div className="tb-next">{nextLine}</div>}
      </>}
    </div>

    <div className="tb-progress"><i style={{ width: pct + '%' }} /></div>
    <div className="tb-legend">
      <span>{t('{0} left', clock(totalLeft))}</span>
      <span>{t('{0}% done', Math.round(pct))}</span>
    </div>

    <div className="tb-acts">
      <Button icon="flag" onClick={leave}>{t('Exit')}</Button>
      <Button trailingIcon="chevronRight" onClick={() => { setPaused(false); advance() }}>{t('Skip')}</Button>
      <Button variant="primary" icon={paused ? 'play' : 'pause'} onClick={() => {
        if (!paused) pauseNow(); else setPaused(false)
      }}>{paused ? t('Resume') : t('Pause')}</Button>
    </div>
  </div>
}
