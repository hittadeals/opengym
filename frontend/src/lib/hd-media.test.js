import { describe, it, expect } from 'vitest'
import { HD_GIF, HD_BASE, HD_TAG } from './hd-media.js'
import { EXIDX } from './exercises.js'

describe('HD exercise media map', () => {
  it('uses a pinned HTTPS jsDelivr base', () => {
    expect(HD_BASE.startsWith('https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@')).toBe(true)
    expect(HD_TAG).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('maps almost every catalogue exercise', () => {
    const mapped = Object.keys(HD_GIF)
    expect(mapped.length).toBeGreaterThanOrEqual(1300)
    for (const id of mapped) expect(EXIDX[id], id).toBeTruthy()
  })

  it('stores relative GIF paths', () => {
    for (const [id, file] of Object.entries(HD_GIF)) {
      expect(file, id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+\.gif$/)
    }
  })

  it('maps the kettlebell Tabata exercises', () => {
    for (const id of ['0534', '0549', '0550', '0551']) expect(HD_GIF[id], id).toBeTruthy()
  })

  it('leaves the one unmatched exercise to the bundled media', () => {
    expect(HD_GIF['0609']).toBeUndefined()   // london bridge
  })
})
