/**
 * Engine-output landing helpers (gfv5h0g — server-owned jobs): the
 * exact-descriptor output resolution and the remote-output fetch+ingest,
 * shared by the HTTP routes (/outputs/resolve, /documents/blobs/ingest-output)
 * and the job watcher so both land outputs through ONE mechanism — never a
 * parallel landing path.
 *
 * Attribution discipline (unchanged from the route's own wording): outputs
 * are addressed by the EXACT filename/subfolder/type the engine reported —
 * never by "newest file in the directory", which can belong to a concurrent
 * render.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'

/** The engine's output descriptor — the ComfyUI-reported tuple. */
export type EngineOutputDescriptor = { filename: string; subfolder?: string; type?: string }

/** Resolves a ComfyUI-reported output file inside the configured output
 *  directory. Attributing outputs by exact filename — instead of scanning for
 *  the newest file — is what keeps concurrent renders from being credited to
 *  the wrong job (and the wrong character library entry). Returns null when
 *  the descriptor does not name an existing output-contained file. */
export function resolveEngineOutputFile(outputDirectory: string, file: EngineOutputDescriptor): string | null {
  if (!outputDirectory || !file.filename) return null
  if (file.type && file.type !== 'output') return null
  const relativePath = file.subfolder ? join(file.subfolder, file.filename) : file.filename
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) return null
  const root = resolve(outputDirectory)
  const candidate = resolve(root, relativePath)
  const containment = relative(root, candidate)
  if (containment.startsWith('..') || isAbsolute(containment)) return null
  return existsSync(candidate) ? candidate : null
}

export type IngestedEngineOutput = {
  path: string
  blob: { relPath: string; hash: string | null; size: number | null; present: boolean }
}

/** Remote-engine output ingest (the B2 contract as a shared function): a
 *  completed render whose output never resolved to a LOCAL file (external
 *  ComfyUI, or a subfolder/output-dir mismatch) is fetched from the engine's
 *  /view, landed as an output-dir copy + content-addressed blob — the render
 *  becomes durable instead of dying with the engine's output rotation. */
export async function ingestEngineOutputFile(input: {
  /** The engine's /view base, already scheme-completed and cleaned. */
  viewBase: string
  outputDirectory: string
  registerBlobFile: (kind: 'image' | 'video' | 'audio', path: string) => IngestedEngineOutput['blob']
  file: EngineOutputDescriptor
  kind: 'image' | 'video' | 'audio'
}): Promise<IngestedEngineOutput> {
  const { filename, subfolder } = input.file
  if (!filename || filename.includes('/') || filename.includes('\\')) throw new Error('Invalid output filename.')
  if (subfolder && (isAbsolute(subfolder) || subfolder.split(/[\\/]/).includes('..'))) throw new Error('Invalid output subfolder.')
  const fileType = input.file.type === 'input' ? 'input' : 'output'
  const query = new URLSearchParams({ filename, subfolder: subfolder ?? '', type: fileType })
  const upstream = await fetch(`${input.viewBase}/view?${query}`)
  if (!upstream.ok || !upstream.body) throw new Error('The engine output could not be fetched — the engine may be unreachable or the output rotated away.')
  const bytes = Buffer.from(await upstream.arrayBuffer())
  if (!bytes.length) throw new Error('The engine output carried no bytes.')
  const extension = extname(filename).toLowerCase().slice(0, 8) || (input.kind === 'image' ? '.png' : input.kind === 'audio' ? '.mp3' : '.mp4')
  const safeStem = basename(filename, extname(filename)).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'engine-output'
  const folder = join(input.outputDirectory, 'canvas-media')
  const outputPath = join(folder, `${safeStem}-${randomUUID().slice(0, 8)}${extension}`)
  await mkdir(folder, { recursive: true })
  await writeFile(outputPath, bytes)
  const blob = input.registerBlobFile(input.kind, outputPath)
  return { path: outputPath, blob }
}
