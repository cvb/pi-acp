import type { AvailableCommand } from '@agentclientprotocol/sdk'

export type PiRpcCommandInfo = {
  name?: unknown
  description?: unknown
  source?: unknown
  location?: unknown
  path?: unknown
  sourceInfo?: unknown
}

function commandSource(c: PiRpcCommandInfo): string {
  if (typeof c.source === 'string') return c.source
  const sourceInfo = c.sourceInfo
  return sourceInfo && typeof sourceInfo === 'object' && typeof (sourceInfo as { source?: unknown }).source === 'string'
    ? (sourceInfo as { source: string }).source
    : ''
}

function commandLocation(c: PiRpcCommandInfo): string {
  if (typeof c.location === 'string') return c.location
  const sourceInfo = c.sourceInfo
  return sourceInfo && typeof sourceInfo === 'object' && typeof (sourceInfo as { scope?: unknown }).scope === 'string'
    ? (sourceInfo as { scope: string }).scope
    : ''
}

function describeFallback(c: PiRpcCommandInfo): string {
  const source = commandSource(c)
  const location = commandLocation(c)

  const parts: string[] = []
  if (source) parts.push(source)
  if (location) parts.push(location)

  return parts.length ? `(${parts.join(':')})` : '(command)'
}

export function toAvailableCommandsFromPiGetCommands(
  data: unknown,
  opts?: { enableSkillCommands?: boolean; includeExtensionCommands?: boolean }
): {
  commands: AvailableCommand[]
  raw: PiRpcCommandInfo[]
  extensionCommandNames: string[]
} {
  const enableSkillCommands = opts?.enableSkillCommands ?? true
  const includeExtensionCommands = opts?.includeExtensionCommands ?? true

  const root: any = data
  const commandsRaw: PiRpcCommandInfo[] = Array.isArray(root?.commands)
    ? root.commands
    : Array.isArray(root?.data?.commands)
      ? root.data.commands
      : []

  const out: AvailableCommand[] = []
  const extensionCommandNames: string[] = []

  for (const c of commandsRaw) {
    const name = typeof c?.name === 'string' ? c.name.trim() : ''
    if (!name) continue

    const source = commandSource(c)
    if (source === 'extension') extensionCommandNames.push(name)
    if (!includeExtensionCommands && source === 'extension') continue

    if (!enableSkillCommands && name.startsWith('skill:')) continue

    const desc = typeof c?.description === 'string' ? c.description.trim() : ''

    out.push({
      name,
      description: desc || describeFallback(c)
    })
  }

  return { commands: out, raw: commandsRaw, extensionCommandNames }
}
