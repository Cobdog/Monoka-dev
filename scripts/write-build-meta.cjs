// Build step: stamps the output with the source state it was built from —
// { commit, version, builtAt, dirty? } into <output>/build-meta.json. The
// launcher's freshness check (start.sh build_stale, friction fix 2026-10-21)
// compares the stamp against git HEAD + package.json version to decide
// "rebuild or boot as-is" — content-stamped invalidation replacing the mtime
// heuristic that missed a CSS-only pull. One writer, two stamps: `build:web`
// stamps dist/, `build:server` stamps dist-server/, and `pnpm build` chains
// both, so a full build stamps both outputs. Dependency-free node (fs +
// child_process only); a dirty working tree still stamps, with "dirty": true
// so a human reading the stamp knows it is not a clean commit; a git-less
// checkout stamps commit:"" and start.sh falls back to its mtime heuristic.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const target = process.argv[2]
if (!target) {
  console.error('write-build-meta: usage: node scripts/write-build-meta.cjs <output-dir>')
  process.exit(2)
}
const root = path.resolve(__dirname, '..')

const git = (args) => {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  } catch {
    return '' // git-less checkout — stamp what we have; start.sh falls back to mtimes
  }
}

const commit = git(['rev-parse', 'HEAD']).trim()
const dirty = commit !== '' && git(['status', '--porcelain']).trim() !== ''
let version = ''
try {
  version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
} catch {
  // package.json always exists here; an unparseable one fails the build long before this stamp
}

const meta = { commit, version, builtAt: new Date().toISOString() }
if (dirty) meta.dirty = true

const outDir = path.resolve(root, target)
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'build-meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
console.log(`write-build-meta: ${path.relative(root, path.join(outDir, 'build-meta.json'))} commit=${commit || '<git-less>'} version=${version}${dirty ? ' (dirty tree)' : ''}`)
