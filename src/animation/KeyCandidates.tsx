/**
 * KeyCandidates — a key slot's candidate strip with the import action
 * (wave 2b, Fix 1): the bound timeline's key card carries ONE selected
 * image; this panel is where the OTHERS come from. Importing an image
 * (files or prepared-character assets) lands it as an ALTERNATIVE
 * candidate of this key — or of a fresh key — and NEVER moves the
 * selection (§5.3: membership grows through add-candidate, choosing is
 * the explicit select command). Selecting is its own button.
 *
 * Props-only (P07): every connection lives in ./state.ts — the file
 * ingestion rides the SAME importImages command the binding panel uses
 * (one blob route, one idiom), and the import/select commands ride the
 * adapter's bag, handed down by the shell. Kit components only;
 * tokens-only styling (the .anim-key-candidates block in animation.css).
 */
import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { documentsApi } from '../canvas/api'
import type { TimelineKey } from './timelineModel'
import type { AnimationAssetPick } from './state'

/** Where an imported image lands: the key under the strip, or a fresh
 *  slot (the store materializes unknown key ids — order max+1, selection
 *  null). */
export type KeyImportDestination = { keyId: string } | { asNewKey: true }

export type KeyCandidatesProps = {
  keyEntity: TimelineKey
  busy: boolean
  /** The file half of the picker — state.ts's importImages (ingest first,
   *  the handles come back content-addressed). */
  onImportFiles(files: File[]): Promise<Array<{ assetId: string; relPath: string }>>
  /** The add half ONLY — the shell routes it to state.ts's
   *  importKeyCandidate; the selection is never touched here. */
  onImport(destination: KeyImportDestination, image: { assetId: string; relPath: string }, origin: 'import' | 'project-asset'): Promise<boolean>
  /** The explicit choice (§7.2.1's select command). */
  onSelect(candidateId: string): void
  /** The prepared characters (§4.1's project assets) — optional; absent or
   *  empty hides the asset half (the files half always stands). */
  assets?: AnimationAssetPick[]
}

/** The relPath-preview guard the timeline's key cards share: a path-like
 *  blob handle resolves through the blob route; anything else renders the
 *  placeholder (an opaque asset id never rides a URL). */
const previewUrlOf = (relPath: string | null): string | null =>
  relPath !== null && relPath.includes('/') ? documentsApi.blobFileUrl(relPath) : null

export function KeyCandidates({ keyEntity, busy, onImportFiles, onImport, onSelect, assets = [] }: KeyCandidatesProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [destination, setDestination] = useState<'into' | 'as-new'>('into')
  const [importing, setImporting] = useState(false)

  const destOf = (): KeyImportDestination => (destination === 'as-new' ? { asNewKey: true } : { keyId: keyEntity.id })

  const importImages = async (images: Array<{ assetId: string; relPath: string }>, origin: 'import' | 'project-asset') => {
    for (const image of images) await onImport(destOf(), image, origin)
  }

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return
    setImporting(true)
    try {
      await importImages(await onImportFiles(files), 'import')
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="anim-key-candidates" data-anim-key-candidates data-anim-key-candidates-key={keyEntity.id} aria-label={`Key ${keyEntity.order} candidates`}>
      <header>
        <strong>Key #{keyEntity.order} — candidate images</strong>
        {keyEntity.lock && <span className="anim-note">locked — the selection cannot change until unlocked</span>}
      </header>
      <p className="anim-note">The key&apos;s image is one of these candidates. Importing adds an alternative — the selection never moves until you choose (§5.3).</p>
      <ul className="anim-key-candidate-strip" data-anim-key-candidate-strip>
        {keyEntity.candidates.map((candidate) => {
          const selected = keyEntity.selectedCandidateId === candidate.id
          const url = previewUrlOf(candidate.assetReference.relPath)
          return (
            <li key={candidate.id} className="anim-key-candidate" data-anim-key-candidate={candidate.id} data-anim-key-candidate-selected={selected ? 'true' : 'false'}>
              {url !== null
                ? <img src={url} alt={`key #${keyEntity.order} candidate (${candidate.origin})`} />
                : <span className="anim-key-candidate-placeholder" aria-hidden="true">no preview</span>}
              <span className="anim-note">{candidate.origin}</span>
              <Button
                variant="secondary"
                busy={busy}
                disabled={selected || keyEntity.lock}
                onClick={() => onSelect(candidate.id)}
                data-anim-key-candidate-select={candidate.id}
                title={selected ? 'This candidate is the key\'s image' : 'Make this candidate the key\'s image'}
              >
                {selected ? 'Selected' : 'Use this image'}
              </Button>
            </li>
          )
        })}
      </ul>

      <div className="anim-key-import" role="group" aria-label="Import a candidate image">
        <span className="anim-binding-label">Import a candidate</span>
        <ChipGroup
          className="anim-mediums"
          data-anim-key-import-destination
          exclusive
          aria-label="Import destination"
          value={destination}
          onChange={(next) => setDestination(next as 'into' | 'as-new')}
        >
          <Chip id="into" variant="radio" className="anim-chip">Into key #{keyEntity.order}</Chip>
          <Chip id="as-new" variant="radio" className="anim-chip">As a new key</Chip>
        </ChipGroup>
        <div className="anim-binding-add">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="anim-file-input"
            data-anim-key-import-files
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              event.target.value = ''
              void importFiles(files)
            }}
          />
          <Button variant="secondary" busy={importing || busy} icon={<ImagePlus size={12} />} onClick={() => fileInput.current?.click()} data-anim-key-import-button>
            Import candidate…
          </Button>
        </div>
        {assets.length > 0 && (
          <div className="anim-key-import-assets" data-anim-key-import-assets role="group" aria-label="Prepared character images">
            <span className="anim-note">Prepared characters</span>
            {assets.map((asset) => (
              asset.images.map((image) => (
                <Button
                  key={`${asset.id}:${image.assetId}`}
                  variant="secondary"
                  busy={importing || busy}
                  onClick={() => void importImages([image], 'project-asset')}
                  data-anim-key-import-asset={image.assetId}
                  title={`Import ${asset.name}'s image as an alternative candidate`}
                >
                  {asset.name} image
                </Button>
              ))
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
