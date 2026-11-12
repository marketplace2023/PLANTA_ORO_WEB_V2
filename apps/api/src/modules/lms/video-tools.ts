import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'

export const videoSource = (url: string | null, videoId?: string | null) =>
  videoId ? `upload:${videoId}` : url ? `url:${createHash('sha256').update(url).digest('hex')}` : null

/** A single HTTP range. Reject multipart/invalid ranges instead of reading the whole video. */
export function videoRange(header: string | undefined, size: number): { start: number; end: number; partial: boolean } | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null
  if (!header) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return null
  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]))
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (suffix && Number(match[2]) <= 0)) return null
  return { start, end, partial: true }
}

/** No shell; paths and arguments cannot become commands. Limit runtime and captured diagnostics. */
export function runVideoTool(binary: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false })
    let output = ''
    let diagnostics = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Tiempo de procesamiento de video agotado')) }, timeoutMs)
    child.stdout.on('data', (data: Buffer) => { output = (output + data.toString()).slice(-200_000) })
    child.stderr.on('data', (data: Buffer) => { diagnostics = (diagnostics + data.toString()).slice(-4_000) })
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`No se pudo procesar el video (${code}): ${diagnostics.slice(-600)}`)) })
  })
}

export function parseVideoProbe(output: string) {
  const info = JSON.parse(output) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }>; format?: { duration?: string; format_name?: string } }
  const duration = Number(info.format?.duration)
  if (!info.streams?.some((stream) => stream.codec_type === 'video' && stream.width && stream.height) || !Number.isFinite(duration) || duration <= 0 || duration > 86_400) {
    throw new BadRequestException('El archivo debe contener video válido, de hasta 24 horas')
  }
  return duration
}
