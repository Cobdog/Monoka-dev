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
 *
 * Wave 2b (Fix 2, T7-M1): when a bound source exists — a picked character
 * in bind mode, the active binding version in UPDATE mode — the description
 * renders READ-ONLY verbatim with the source NAMED, and an explicit "Edit
 * session copy" action unlatches a labeled session-local override (the
 * edits ride the session's binding versions, never the source character).
 * No source (the empty session, nothing picked) stays editable as before.
 * Wave 2b (Fix 1): `mode="update"` prefills from the active binding and
 * frames the write for what it is — appending an immutable BindingVersion
 * that marks spans stale 'binding' and preserves prior takes — mounted from
 * the bound header's "Update character binding" action.
 */
import { useMemo, useRef, useState } from 'react'
import { ImagePlus, Pencil } from 'lucide-react'
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
  /** `bind` (default) — the empty session's binding card; `update` — the
   *  bound session's explicit update flow (prefilled from the active
   *  binding, the write named as a version append). */
  mode?: 'bind' | 'update'
  /** The prepared characters from the global asset store (state.ts loads
   *  them; empty when none exist or the load failed — `assetsFailed` names
   *  the failure). */
  assets: AnimationAssetPick[]
  assetsFailed: boolean
  /** The file half of the picker: ingests through the existing blob route
   *  (state.ts) and hands back the imported handles. */
  onImportFiles(files: File[]): Promise<Array<{ assetId: string; relPath: string }>>
  onSubmitBinding(binding: BindingInput): Promise<boolean>
  /** Update mode only — collapses the panel (the shell unmounts it). */
  onDismiss?(): void
  busy: boolean
  errors?: BindingErrors
}

/** One picked image in the panel's pool. */
type PoolImage = { assetId: string; relPath: string; source: string | null }

export function BindingPanel({ document, mode = 'bind', assets, assetsFailed, onImportFiles, onSubmitBinding, onDismiss, busy, errors }: BindingPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const activeBinding = document.body.bindingHistory.find((entry) => entry.version === document.body.activeBindingVersion) ?? null
  // Update mode prefills from the active binding (the panel mounts fresh —
  // the shell unmounts it between opens, so lazy initializers are the seed).
  const [pool, setPool] = useState<PoolImage[]>(() => (mode === 'update' && activeBinding !== null
    ? activeBinding.referenceAssetIds.map((assetId) => ({ assetId, relPath: assetId, source: null }))
    : []))
  const [description, setDescription] = useState(() => (mode === 'update' && activeBinding !== null ? activeBinding.characterDescription : ''))
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [references, setReferences] = useState<string[]>(() => (mode === 'update' && activeBinding !== null ? [...activeBinding.referenceAssetIds] : []))
  const [initialKey, setInitialKey] = useState<string | null>(() => (mode === 'update' && activeBinding !== null ? activeBinding.initialKeyAssetId : null))
  const [medium, setMedium] = useState<MediumString | null>(() => (mode === 'update' && activeBinding !== null ? activeBinding.medium : null))
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  // T7-M1: the override latch — one-way, session-local. Latched, the
  // description textarea is editable and carries the labeled override note.
  const [overrideUnlocked, setOverrideUnlocked] = useState(false)

  // The description's SOURCE (the T7-M1 gate): a picked character in bind
  // mode; in update mode the bound version itself always is the source —
  // its text renders verbatim until explicitly overridden.
  const boundSource = mode === 'update'
    ? (activeBinding === null ? null : `the bound version ${activeBinding.version}`)
    : sourceName
  const descriptionLocked = boundSource !== null && !overrideUnlocked

  const addImages = (images: Array<{ assetId: string; relPath: string }>, source: string | null) => {
    setPool((current) => {
      const known = new Set(current.map((image) => image.assetId))
      return [...current, ...images.filter((image) => !known.has(image.assetId)).map((image) => ({ ...image, source }))]
    })
  }

  /** A prepared character (§4.1's "existing project assets"): its curated
   *  set becomes the reference set and its description is retained
   *  VERBATIM (§4.2 — the session stores the exact version used; editing
   *  the source character later never silently changes a bound session).
   *  UPDATE mode adds the character's images to the pool ONLY — an update
   *  never clobbers the bound description or reference set by side effect;
   *  the reviewer adds references by explicit toggles. */
  const pickCharacter = (asset: AnimationAssetPick) => {
    if (mode === 'update') {
      addImages(asset.images, asset.name)
      return
    }
    addImages(asset.images, asset.name)
    setReferences(asset.images.map((image) => image.assetId))
    setDescription(asset.description)
    setSourceName(asset.name)
    // Wave 3 (the 2b review's M-2): a re-pick RESETS the override latch —
    // the newly picked source's verbatim text is not an override, so the
    // labeled session-local note never sits on an unedited copy. The next
    // explicit "Edit session copy" unlatches it again.
    setOverrideUnlocked(false)
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

  const descriptionField = descriptionLocked ? (
    <div className="anim-binding-locked" data-anim-binding-description-locked>
      <span className="anim-binding-label">Locked character description</span>
      <p className="anim-binding-locked-text">{description}</p>
      <p className="anim-note">From {boundSource}, verbatim — the session stores this exact text{mode === 'bind' ? '; editing the source later never changes a bound session' : ''}.</p>
      <Button
        variant="secondary" className="anim-btn"
        icon={<Pencil size={12} />}
        onClick={() => setOverrideUnlocked(true)}
        data-anim-binding-override
        title="Unlatch a session-local copy of the description and edit it"
      >
        Edit session copy
      </Button>
    </div>
  ) : (
    <>
      <Field
        label="Locked character description"
        htmlFor="anim-binding-description"
        hint={boundSource !== null
          ? `Session-local override of ${boundSource} — the edited text is what the next binding version stores.`
          : 'Verbatim — the session stores the exact text used.'}
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
      {overrideUnlocked && (
        <p className="anim-note anim-binding-override-label" role="note" data-anim-binding-override-label>
          session-local override — edits stay in this session&apos;s binding versions
        </p>
      )}
    </>
  )

  return (
    <section className="anim-binding" data-anim-binding={mode} aria-labelledby="anim-binding-title">
      <h3 id="anim-binding-title">{mode === 'update' ? 'Update the character binding' : 'Bind the session'} — {document.name}</h3>
      <p className="anim-binding-lede">
        {mode === 'update'
          ? 'Append the next binding version — new references or an edited description.'
          : 'Pick the character material and the first pose; the medium is a session setting.'}
      </p>

      {missing.length > 0 && (
        <Refusal
          title={mode === 'update' ? 'The update is incomplete' : 'The session is not bound yet'}
          reason={`Still missing: ${missing.join(', ')}.${mode === 'update' ? ' The current binding stands until a complete version is appended.' : ' Rendering stays gated until the session is bound.'}`}
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
              title={mode === 'update' ? "Add this character's reference images to the pool" : "Use this character's reference set and its description verbatim"}
            >
              {asset.name} — {asset.images.length} refs
            </button>
          ))}
        </div>

        <div className="anim-binding-picker" role="group" aria-label="Session images">
          <span className="anim-binding-label">Reference images</span>
          <div className="anim-binding-add">
            <input ref={fileInput} type="file" accept="image/*" multiple className="anim-file-input" data-anim-binding-files onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void importFiles(files) }} />
            <Button variant="secondary" className="anim-btn" busy={importing} icon={<ImagePlus size={12} />} onClick={() => fileInput.current?.click()}>Add image files</Button>
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

        {descriptionField}

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
        <Button variant="primary" className="anim-btn" busy={busy} disabled={!canSubmit} onClick={() => void submit()} data-anim-binding-submit>
          {mode === 'update' ? `Append binding version ${document.body.activeBindingVersion + 1}` : 'Bind the session'}
        </Button>
        {mode === 'update' && (
          <p className="anim-note" role="note" data-anim-binding-update-note>
            Appends an immutable binding version — prior takes are preserved; spans mark stale until re-rendered; nothing is deleted.
          </p>
        )}
        {mode === 'update' && onDismiss && (
          <Button variant="secondary" className="anim-btn" onClick={onDismiss} data-anim-binding-dismiss>Close without updating</Button>
        )}
      </div>
    </section>
  )
}
