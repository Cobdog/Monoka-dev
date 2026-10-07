/**
 * BindingPanel — the animation session's binding step (task 7, k2q0n9s,
 * spec §4.1): a COMPACT SESSION PANEL, not a wizard. One card in the shell's
 * workspace carrying the four inputs —
 *
 *   reference images (prepared characters + files) → the character
 *   description (retained verbatim from its source, §4.2) → the medium
 *   (the adapter's fixed vocabulary, an exclusive ChipGroup radiogroup —
 *   the kit's selection contract) → the initial key (an EXPLICIT image
 *   selection).
 *
 * Props-only (P07): every connection lives in ./state.ts — the panel holds
 * its own draft, and `onSubmitBinding` hands the finished BindingInput to
 * the adapter. An empty session exposes its missing inputs INLINE through
 * the kit's Refusal (the gate that blocks BEFORE anything runs) while the
 * rest of the shell stands — never a modal, never a blocked workspace.
 *
 * The image handle is the blob relPath everywhere (content-addressed, the
 * same handle the binding's reference ids carry); previews resolve through
 * documentsApi.blobFileUrl.
 */
import { useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { Field } from '../ui/Field'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { ANIMATION_MEDIA, mediumChipId, mediumFromChipId, type BindingInput, type MediumString } from '../../shared/animation/types'
import type { AnimationDocumentView } from './client'
import type { AnimationAssetPick } from './state'

/** Field-keyed server failures (a 400's reason lands on the field it named;
 *  anything else rides `submit`). */
export type BindingErrors = Partial<Record<'characterDescription' | 'referenceAssetIds' | 'medium' | 'initialKeyAssetId' | 'submit', string>>

export type BindingPanelProps = {
  document: AnimationDocumentView
  /** The prepared characters from the global asset store (state.ts loads
   *  them; empty when none exist or the load failed — `assetsFailed` names
   *  the failure). */
  assets: AnimationAssetPick[]
  assetsFailed: boolean
  /** The file half of the picker: ingests through the existing blob route
   *  (state.ts) and hands back the imported handles. */
  onImportFiles(files: File[]): Promise<Array<{ assetId: string; relPath: string }>>
  onSubmitBinding(binding: BindingInput): Promise<boolean>
  busy: boolean
  errors?: BindingErrors
}

/** One picked image in the panel's pool. */
type PoolImage = { assetId: string; relPath: string; source: string | null }

export function BindingPanel({ document, assets, assetsFailed, onImportFiles, onSubmitBinding, busy, errors }: BindingPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pool, setPool] = useState<PoolImage[]>([])
  const [description, setDescription] = useState('')
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [references, setReferences] = useState<string[]>([])
  const [initialKey, setInitialKey] = useState<string | null>(null)
  const [medium, setMedium] = useState<MediumString | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const addImages = (images: Array<{ assetId: string; relPath: string }>, source: string | null) => {
    setPool((current) => {
      const known = new Set(current.map((image) => image.assetId))
      return [...current, ...images.filter((image) => !known.has(image.assetId)).map((image) => ({ ...image, source }))]
    })
  }

  /** A prepared character (§4.1's "existing project assets"): its curated
   *  set becomes the reference set and its description is retained
   *  VERBATIM (§4.2 — the session stores the exact version used; editing
   *  the source character later never silently changes a bound session). */
  const pickCharacter = (asset: AnimationAssetPick) => {
    addImages(asset.images, asset.name)
    setReferences(asset.images.map((image) => image.assetId))
    setDescription(asset.description)
    setSourceName(asset.name)
  }

  const importFiles = async (files: File[]) => {
    if (!files.length) return
    setImporting(true)
    setImportError(null)
    try {
      const imported = await onImportFiles(files)
      addImages(imported, null)
      // An imported file lands IN the reference set — the pick is the
      // explicit act; removal is its own toggle on the row.
      setReferences((current) => [...current, ...imported.map((image) => image.assetId).filter((assetId) => !current.includes(assetId))])
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
    }
  }

  const toggleReference = (assetId: string) => {
    setReferences((current) => (current.includes(assetId) ? current.filter((entry) => entry !== assetId) : [...current, assetId]))
  }

  const removeImage = (assetId: string) => {
    setPool((current) => current.filter((image) => image.assetId !== assetId))
    setReferences((current) => current.filter((entry) => entry !== assetId))
    setInitialKey((current) => (current === assetId ? null : current))
  }

  const missing: string[] = []
  if (references.length === 0) missing.push('reference images')
  if (!description.trim()) missing.push('the character description')
  if (medium === null) missing.push('a medium')
  if (initialKey === null) missing.push('the initial key')

  const canSubmit = missing.length === 0 && !busy

  const submit = async () => {
    if (!canSubmit || medium === null || initialKey === null) return
    await onSubmitBinding({
      characterDescription: description,
      referenceAssetIds: references,
      medium,
      initialKeyAssetId: initialKey,
    })
    // A false answer means the adapter surfaced a conflict or commandError —
    // the panel stands with its draft; the shell names the failure.
  }

  const mediumValue = useMemo(() => (medium === null ? null : mediumChipId(medium)), [medium])

  return (
    <section className="anim-binding" data-anim-binding aria-labelledby="anim-binding-title">
      <h3 id="anim-binding-title">Bind the session — {document.name}</h3>
      <p className="anim-binding-lede">Pick the prepared character material and the first pose; the medium is a session setting, not a character attribute (§4.1).</p>

      {missing.length > 0 && (
        <Refusal
          title="The session is not bound yet"
          reason={`Still missing: ${missing.join(', ')}. Rendering stays gated until the session is bound.`}
        />
      )}

      <div className="anim-binding-fields">
        <div className="anim-binding-assets" data-anim-binding-assets role="group" aria-label="Prepared characters">
          <span className="anim-binding-label">Prepared characters</span>
          {assetsFailed && <p className="anim-note" role="status">The character library could not be listed — files still bind below.</p>}
          {!assetsFailed && assets.length === 0 && <p className="anim-note">No prepared characters with reference sets yet — import files instead.</p>}
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className="anim-asset-pick"
              data-anim-asset-pick={asset.id}
              onClick={() => pickCharacter(asset)}
              title="Use this character's reference set and its description verbatim"
            >
              {asset.name} — {asset.images.length} refs
            </button>
          ))}
        </div>

        <div className="anim-binding-picker" role="group" aria-label="Session images">
          <span className="anim-binding-label">Reference images</span>
          <div className="anim-binding-add">
            <input ref={fileInput} type="file" accept="image/*" multiple className="anim-file-input" data-anim-binding-files onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void importFiles(files) }} />
            <Button variant="secondary" busy={importing} icon={<ImagePlus size={12} />} onClick={() => fileInput.current?.click()}>Add image files</Button>
          </div>
          {importError && <p className="anim-binding-error" role="alert">The import failed: {importError}</p>}
          {pool.length === 0 && <p className="anim-note">No images picked yet — a prepared character or the files above feed this pool.</p>}
          <ul className="anim-pool" data-anim-binding-pool>
            {pool.map((image) => {
              const isReference = references.includes(image.assetId)
              const isInitial = initialKey === image.assetId
              return (
                <li key={image.assetId} className="anim-pool-image" data-anim-pool-image data-anim-pool-reference={isReference ? 'true' : 'false'} data-anim-pool-initial={isInitial ? 'true' : 'false'}>
                  <img src={documentsApi.blobFileUrl(image.relPath)} alt={image.source ? `${image.source} reference` : 'imported reference'} />
                  <div className="anim-pool-actions">
                    <button type="button" data-anim-pool-toggle onClick={() => toggleReference(image.assetId)} aria-pressed={isReference}>
                      {isReference ? 'reference' : 'not a reference'}
                    </button>
                    <button type="button" data-anim-pool-initial-key onClick={() => setInitialKey(isInitial ? null : image.assetId)} aria-pressed={isInitial}>
                      {isInitial ? 'initial key ✓' : 'set as initial key'}
                    </button>
                    <button type="button" data-anim-pool-remove onClick={() => removeImage(image.assetId)}>remove</button>
                  </div>
                </li>
              )
            })}
          </ul>
          {errors?.referenceAssetIds && <p className="anim-binding-error" role="alert">{errors.referenceAssetIds}</p>}
        </div>

        <Field
          label="Locked character description"
          htmlFor="anim-binding-description"
          hint={sourceName
            ? `From ${sourceName}, retained verbatim — the session stores this exact version (§4.2); editing the source later never silently changes a bound session.`
            : 'Retained verbatim — the session stores the exact version used (§4.2).'}
          error={errors?.characterDescription}
        >
          <textarea
            id="anim-binding-description"
            className="anim-binding-description"
            data-anim-binding-description
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field
          label="Medium"
          htmlFor="anim-binding-medium"
          hint="The adapter's fixed vocabulary — an animation-session setting; one character can animate in several media."
          error={errors?.medium}
        >
          <ChipGroup
            id="anim-binding-medium"
            className="anim-mediums"
            data-anim-binding-medium
            exclusive
            aria-label="Medium"
            value={mediumValue}
            onChange={(next) => setMedium(mediumFromChipId(next as string))}
          >
            {ANIMATION_MEDIA.map((entry) => (
              <Chip key={entry} id={mediumChipId(entry)} variant="radio" className="anim-chip">{entry}</Chip>
            ))}
          </ChipGroup>
        </Field>
      </div>

      {errors?.initialKeyAssetId && <p className="anim-binding-error" role="alert">{errors.initialKeyAssetId}</p>}
      {errors?.submit && <p className="anim-binding-error" role="alert">{errors.submit}</p>}
      <div className="anim-binding-submit">
        <Button variant="primary" busy={busy} disabled={!canSubmit} onClick={() => void submit()} data-anim-binding-submit>
          Bind the session
        </Button>
      </div>
    </section>
  )
}
