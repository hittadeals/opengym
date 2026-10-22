#!/usr/bin/env node
// Replace the bundled 180x180 exercise GIFs with the higher-resolution licensed set
// from ExerciseDB.io (Starter: 180 + 360, Pro: 180 + 360 + 720 + 1080).
//
// The two datasets share the same numeric exercise ids (0025 is "barbell bench press"
// in both), so the mapping is id -> id. The script still refuses to overwrite a file
// when the exercise name or equipment in the package does not match ours: a wrong demo
// is worse than a soft one.
//
// Package layout expected (as shipped by ExerciseDB.io):
//
//   sample-set/
//     0025.json                 one JSON per exercise, with name/bodyPart/equipment
//     exerciseList.json
//     180/0025.gif
//     360/0025.gif
//     720/0025.gif
//     1080/0025.gif
//
// Usage:
//   node scripts/import-hd-media.mjs --src "/path/to/package/360"
//   node scripts/import-hd-media.mjs --src ".../720" --dry-run
//
// Options:
//   --src <dir>        resolution folder containing <id>.gif   (required)
//   --json <dir>       folder containing <id>.json             (default: parent of --src)
//   --media <dir>      app media folder                        (default: ./media/gif)
//   --backup <dir>     where the old 180 files are kept once   (default: <media>/../gif-180-original)
//   --min-score <n>    minimum name similarity 0..1            (default: 0.4)
//   --dry-run          report only, copy nothing
//   --force            copy even when name/equipment looks wrong (not recommended)
//
// Writes a TSV report next to the media folder: hd-import-report.tsv
// Media is gitignored; never commit licensed files to the repository.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXDB } from '../frontend/src/lib/exercises-data.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const flag = name => args.includes('--' + name)

const src = opt('src')
if (!src) {
  console.error('Missing --src <resolution folder containing <id>.gif>')
  console.error('Example: node scripts/import-hd-media.mjs --src "./sample-set/360"')
  process.exit(2)
}
const srcDir = path.resolve(src)
const jsonDir = path.resolve(opt('json', path.join(srcDir, '..')))
const mediaDir = path.resolve(opt('media', path.join(repo, 'media', 'gif')))
const backupDir = path.resolve(opt('backup', path.join(mediaDir, '..', 'gif-180-original')))
const minScore = Number(opt('min-score', '0.4'))
const dry = flag('dry-run')
const force = flag('force')

if (!fs.existsSync(srcDir)) {
  console.error(`Source folder not found: ${srcDir}`)
  process.exit(2)
}
fs.mkdirSync(mediaDir, { recursive: true })

// GIF header: "GIF89a" + little-endian width/height. Confirms the folder really is the
// resolution it claims to be before replacing anything.
const gifSize = file => {
  const b = Buffer.alloc(10)
  const fd = fs.openSync(file, 'r')
  try { fs.readSync(fd, b, 0, 10, 0) } finally { fs.closeSync(fd) }
  if (b.toString('ascii', 0, 3) !== 'GIF') return null
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
}

const EQUIP = {
  'body weight': 'bodyweight', 'bodyweight': 'bodyweight',
  'ez barbell': 'ez barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
  'leverage machine': 'machine', 'smith machine': 'smith machine',
  'assisted': 'assisted', 'resistance band': 'band', 'stability ball': 'stability ball'
}
const normEq = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
const eqKey = s => EQUIP[normEq(s)] || normEq(s)

// Name similarity over meaningful tokens. "45° side bend" vs "45-degree Roman chair
// side bend" has to pass; "assisted pull-up" vs "band assisted pull-up" passes too.
const STOP = new Set(['a', 'an', 'the', 'with', 'and', 'or', 'on', 'to', 'of', 'from', 'in', 'at', 'for', 'male', 'female', 'position'])
const tokens = s => String(s || '')
  .toLowerCase()
  .replace(/[°º]/g, ' degree ')
  .replace(/[^a-z0-9]+/g, ' ')
  .split(/\s+/)
  .filter(w => w && !STOP.has(w))
  .map(w => (w === 'all' ? 'all' : w))
const score = (a, b) => {
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

const rows = []
let copied = 0, missing = 0, review = 0, same = 0, backedUp = 0
let resolution = null

for (const ex of EXDB) {
  const srcFile = path.join(srcDir, ex.id + '.gif')
  const jsonFile = path.join(jsonDir, ex.id + '.json')
  const target = path.join(mediaDir, ex.gif || ex.id + '.gif')
  const row = { id: ex.id, ours: ex.n, edb: '', score: '', eq: '', status: 'ok' }

  if (!fs.existsSync(srcFile)) {
    // The package is a superset of this dataset, so a missing id means the id schemes
    // have drifted; leave the 180 file exactly as it is and report it.
    missing++
    rows.push({ ...row, status: 'missing-in-package' })
    continue
  }

  if (!resolution) resolution = gifSize(srcFile)

  let edb = null
  try { edb = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) } catch { /* no json */ }

  let s = 1, eqNote = ''
  if (edb) {
    row.edb = edb.name || ''
    s = score(ex.n, edb.name)
    row.score = s.toFixed(3)
    const a = eqKey(ex.eq), b = eqKey(edb.equipment)
    if (a !== b) {
      eqNote = `equipment: ${ex.eq} <> ${edb.equipment}`
      s = Math.min(s, 0.35)
    }
  } else {
    // No metadata to verify against: require an explicit --force, otherwise skip.
    row.status = 'no-json'
  }

  const low = !!edb && s < minScore
  if (low || eqNote) {
    review++
    rows.push({ ...row, status: 'review' + (eqNote ? ' (' + eqNote + ')' : ''), score: s.toFixed(3) })
    if (!force) continue
  } else if (!edb && !force) {
    review++
    rows.push(row)
    continue
  }

  if (!dry) {
    if (fs.existsSync(target)) {
      const cur = gifSize(target)
      if (cur && resolution && cur.w === resolution.w && cur.h === resolution.h) same++
      else {
        fs.mkdirSync(backupDir, { recursive: true })
        const bak = path.join(backupDir, path.basename(target))
        if (!fs.existsSync(bak)) { fs.copyFileSync(target, bak); backedUp++ }
      }
    }
    fs.copyFileSync(srcFile, target)
  }
  copied++
  rows.push({ ...row, status: dry ? 'would-copy' : 'copied', score: edb ? s.toFixed(3) : 'unverified' })
}

const report = path.join(mediaDir, '..', 'hd-import-report.tsv')
const head = ['id', 'ours', 'edb', 'score', 'status']
const tsv = [head.join('\t'), ...rows.map(r => [r.id, r.ours, r.edb, r.score, r.status].join('\t'))].join('\n') + '\n'
if (!dry) fs.writeFileSync(report, tsv, 'utf8')

console.log(`source:  ${srcDir}${resolution ? ` (${resolution.w}x${resolution.h})` : ''}`)
console.log(`json:    ${jsonDir}`)
console.log(`target:  ${mediaDir}`)
console.log(`backup:  ${backupDir}`)
console.log('')
console.log(`exercises:            ${EXDB.length}`)
console.log(`copied:               ${copied}${dry ? ' (dry run)' : ''}`)
console.log(`already at this size: ${same}`)
console.log(`old files backed up:  ${backedUp}`)
console.log(`missing in package:   ${missing}`)
console.log(`needs review:         ${review}`)
if (missing) {
  console.log('\nMissing ids (kept the 180 file):')
  console.log(rows.filter(r => r.status === 'missing-in-package').slice(0, 25).map(r => r.id + ' ' + r.ours).join('\n'))
  if (missing > 25) console.log(`... and ${missing - 25} more — see ${report}`)
}
if (review) {
  console.log('\nName/equipment mismatches (not copied unless --force):')
  console.log(rows.filter(r => r.status.startsWith('review') || r.status === 'no-json').slice(0, 25).map(r => `${r.id} ${r.ours} <> ${r.edb || '?'} (${r.score || '?'})`).join('\n'))
  if (review > 25) console.log(`... and ${review - 25} more — see ${report}`)
}
console.log(`\nreport: ${report}`)
console.log('Redeploy, or just reload the page: the web server serves the media folder directly.')
console.log('Already-installed clients cache media cache-first — bump CACHE in frontend/public/sw.js')
console.log('(opengym-rt-v1 -> v2) when you swap the files, or they keep the old cached GIFs.')
