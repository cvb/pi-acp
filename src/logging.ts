import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'

type Destination = { kind: 'stderr' } | { kind: 'file'; fd: number; path: string }

type BufferedStream = {
  decoder: StringDecoder
  pending: string
}

export class DebugLogger {
  private destination: Destination | null = null
  private readonly streams = new Map<string, BufferedStream>()
  private failed = false

  constructor(setting?: string) {
    const value = setting?.trim()
    if (!value || value === '0' || value.toLowerCase() === 'false') return

    try {
      if (value.toLowerCase() === 'stderr') {
        this.destination = { kind: 'stderr' }
      } else {
        const path =
          value === '1' || value.toLowerCase() === 'true'
            ? join(homedir(), '.pi', 'pi-acp', 'debug.log')
            : expandPath(value)
        mkdirSync(dirname(path), { recursive: true })
        this.destination = { kind: 'file', fd: openSync(path, 'a', 0o600), path }
      }
      this.log('adapter', `debug logging started (destination=${this.description()})`)
    } catch (error) {
      this.failed = true
      this.destination = null
      try {
        process.stderr.write(`[pi-acp] failed to initialize debug logging: ${String(error)}\n`)
      } catch {
        // Logging must never interfere with the ACP transport.
      }
    }
  }

  get enabled(): boolean {
    return this.destination !== null && !this.failed
  }

  description(): string {
    if (!this.destination) return 'disabled'
    return this.destination.kind === 'stderr' ? 'stderr' : this.destination.path
  }

  log(channel: string, message: string): void {
    if (!this.enabled) return
    const lines = message.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    for (const line of lines) this.write(`[${new Date().toISOString()}] [pid=${process.pid}] [${channel}] ${line}\n`)
  }

  chunk(channel: string, chunk: Uint8Array): void {
    if (!this.enabled) return
    let stream = this.streams.get(channel)
    if (!stream) {
      stream = { decoder: new StringDecoder('utf8'), pending: '' }
      this.streams.set(channel, stream)
    }

    stream.pending += stream.decoder.write(Buffer.from(chunk))
    this.writeCompleteLines(channel, stream)
  }

  flush(channel?: string): void {
    if (!this.enabled) return
    const entries = channel ? [[channel, this.streams.get(channel)] as const] : [...this.streams.entries()]
    for (const [name, stream] of entries) {
      if (!stream) continue
      stream.pending += stream.decoder.end()
      if (stream.pending) this.log(name, stream.pending)
      this.streams.delete(name)
    }
  }

  close(): void {
    if (!this.destination) return
    this.flush()
    this.log('adapter', 'debug logging stopped')
    if (this.destination.kind === 'file') {
      try {
        closeSync(this.destination.fd)
      } catch {
        // Best effort during shutdown.
      }
    }
    this.destination = null
  }

  private writeCompleteLines(channel: string, stream: BufferedStream): void {
    let newline = stream.pending.indexOf('\n')
    while (newline !== -1) {
      const line = stream.pending.slice(0, newline).replace(/\r$/, '')
      this.log(channel, line)
      stream.pending = stream.pending.slice(newline + 1)
      newline = stream.pending.indexOf('\n')
    }
  }

  private write(text: string): void {
    if (!this.destination || this.failed) return
    try {
      if (this.destination.kind === 'stderr') process.stderr.write(text)
      else writeSync(this.destination.fd, text)
    } catch (error) {
      this.failed = true
      try {
        process.stderr.write(`[pi-acp] debug logging failed: ${String(error)}\n`)
      } catch {
        // Ignore secondary logging failures.
      }
    }
  }
}

function expandPath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return resolve(path)
}

export const debugLogger = new DebugLogger(process.env.PI_ACP_LOG)
