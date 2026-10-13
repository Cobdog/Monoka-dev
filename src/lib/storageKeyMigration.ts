/** The one-time localStorage key migration (rename-sweep T2, 2026-10-12):
 *  the app-owned `minimax.*` keys became `monoka.*` with ZERO back-compat —
 *  the maintainer's ruling allows exactly one legacy-tolerant pass, and this
 *  copy is it. Runs at the earliest storage-module load (main.tsx, before
 *  any reader mounts), then never again:
 *
 *   - every legacy key's value copies to its new name ONLY when the new key
 *     is absent — a divergent new key is newer truth (post-rename boot) and
 *     always wins;
 *   - the old keys stay in place, un-read (removal is the maintainer's
 *     browser action, never code);
 *   - the `monoka.storage-migrated` marker makes the pass idempotent — a
 *     second boot never re-copies over data the app has since written;
 *   - a blocked/quota-failing marker write leaves no marker, so the copy
 *     retries next boot (already-copied keys skip via the absent-new-key
 *     rule, making the retry safe).
 *
 *  Scratch keys (wizard state, first-run dismiss, the dbg flip) hard-renamed
 *  with NO copy by design — re-showing the wizard or the notice is benign.
 *  The map below is the complete legacy→new table (inventory §2's data-key
 *  rows); a data key renamed in a reader must appear here in the same
 *  commit or its data strands. */

const STORAGE_MIGRATION_MARKER = 'monoka.storage-migrated'

const COPY_FORWARD: Array<readonly [legacyKey: string, newKey: string]> = [
  ['minimax.hair-style-projects', 'monoka.hair-style-projects'],
  ['minimax.wardrobe-projects', 'monoka.wardrobe-projects'],
  ['minimax.location-projects', 'monoka.location-projects'],
  ['minimax.character-projects', 'monoka.character-projects'],
  ['minimax.accessory-projects', 'monoka.accessory-projects'],
  // The wardrobe→accessory one-time migration marker keeps its semantics
  // under the new name: without the copy the accessory load would re-run
  // its wardrobe migration over already-migrated data (duplicate rows).
  ['minimax.accessories-migrated-from-wardrobe-v1', 'monoka.accessories-migrated-from-wardrobe-v1'],
  ['minimax.prompt-library', 'monoka.prompt-library'],
  ['minimax.jobs', 'monoka.jobs'],
  ['minimax.workspace', 'monoka.workspace'],
  ['minimax.movie-projects', 'monoka.movie-projects'],
  // The localStorage→SQLite marker copies so an already-migrated browser
  // never re-POSTs a stale local snapshot over newer server rows.
  ['minimax.data-migrated', 'monoka.data-migrated'],
]

/** The one-time copy. Storage is injectable (the suite drives a stub); the
 *  app calls it with the real localStorage before anything reads a key. */
export function runStorageKeyMigration(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
  try {
    if (storage.getItem(STORAGE_MIGRATION_MARKER) === '1') return
    for (const [legacyKey, newKey] of COPY_FORWARD) {
      if (storage.getItem(newKey) !== null) continue // new key wins on divergence
      const legacy = storage.getItem(legacyKey)
      if (legacy === null) continue // nothing to copy
      storage.setItem(newKey, legacy) // copy only — the old key stays in place
    }
    storage.setItem(STORAGE_MIGRATION_MARKER, '1')
  } catch {
    /* Storage blocked or quota-failed: no marker, the copy retries next
     * boot. Readers still work this boot (they see whatever is present). */
  }
}
