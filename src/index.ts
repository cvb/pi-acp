import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'
import { PiAcpAgent } from './acp/agent.js'
import { getPiCommand, shouldUseShellForPiCommand } from './pi-rpc/command.js'
import { debugLogger } from './logging.js'

debugLogger.log('adapter', `started (argv=${JSON.stringify(process.argv)}, cwd=${process.cwd()})`)

// Terminal Auth entrypoint. The ACP client launches the agent with `--terminal-login`.
if (process.argv.includes('--terminal-login')) {
  const { spawnSync } = await import('node:child_process')
  const cmd = getPiCommand(process.env.PI_ACP_PI_COMMAND)
  const res = spawnSync(cmd, [], {
    stdio: 'inherit',
    env: process.env,
    shell: shouldUseShellForPiCommand(cmd)
  })

  if ((res as any).error && (res as any).error.code === 'ENOENT') {
    process.stderr.write(
      `pi-acp: could not start pi (command not found: ${cmd}). Install it via \`npm install -g @earendil-works/pi-coding-agent\` or ensure \`pi\` is on your PATH.\n`
    )
    process.exit(1)
  }

  process.exit(typeof res.status === 'number' ? res.status : 1)
}

const input = new WritableStream<Uint8Array>({
  write(chunk) {
    debugLogger.chunk('acp:adapter->client', chunk)
    return new Promise<void>(resolve => {
      if ((process.stdout as any).destroyed || !process.stdout.writable) {
        debugLogger.log('adapter', 'ACP stdout is closed; dropping outgoing data')
        return resolve()
      }

      try {
        process.stdout.write(chunk, error => {
          if (error) debugLogger.log('adapter', `ACP stdout write failed: ${error.stack ?? String(error)}`)
          resolve()
        })
      } catch (error) {
        // Common: ERR_STREAM_DESTROYED ("Cannot call write after a stream was destroyed").
        debugLogger.log(
          'adapter',
          `ACP stdout write threw: ${error instanceof Error ? (error.stack ?? String(error)) : String(error)}`
        )
        resolve()
      }
    })
  }
})

const output = new ReadableStream<Uint8Array>({
  start(controller) {
    process.stdin.on('data', (chunk: Buffer) => {
      debugLogger.chunk('acp:client->adapter', chunk)
      controller.enqueue(new Uint8Array(chunk))
    })
    process.stdin.on('end', () => {
      debugLogger.flush('acp:client->adapter')
      debugLogger.log('adapter', 'ACP stdin ended')
      controller.close()
    })
    process.stdin.on('error', err => {
      debugLogger.log('adapter', `ACP stdin error: ${String(err)}`)
      controller.error(err)
    })
  }
})

const stream = ndJsonStream(input, output)

const agent = new AgentSideConnection(conn => new PiAcpAgent(conn), stream)

function shutdown() {
  debugLogger.log('adapter', 'shutting down')
  try {
    // Best-effort: dispose session subprocesses when the client disconnects.
    ;(agent as any)?.agent?.dispose?.()
  } catch {
    // ignore
  }
  debugLogger.close()
  try {
    process.exit(0)
  } catch {
    // ignore
  }
}

process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)

process.stdin.resume()
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Avoid crashing if the client closes stdout early.
process.stdout.on('error', error => {
  debugLogger.log('adapter', `ACP stdout error: ${String(error)}`)
  debugLogger.close()
  try {
    process.exit(0)
  } catch {
    // ignore
  }
})

process.on('uncaughtExceptionMonitor', (error, origin) => {
  debugLogger.log('adapter', `uncaught exception (${origin}): ${error.stack ?? String(error)}`)
  debugLogger.close()
})
process.on('warning', warning => {
  debugLogger.log('adapter', `process warning: ${warning.stack ?? String(warning)}`)
})
process.on('exit', code => {
  debugLogger.log('adapter', `exiting (code=${code})`)
  debugLogger.close()
})
