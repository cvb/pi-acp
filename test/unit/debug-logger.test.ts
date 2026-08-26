import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DebugLogger } from '../../src/logging.js'

test('DebugLogger is disabled when no setting is provided', () => {
  const logger = new DebugLogger()

  assert.equal(logger.enabled, false)
  assert.equal(logger.description(), 'disabled')
  logger.log('test', 'ignored')
  logger.close()
})

test('DebugLogger writes complete and fragmented UTF-8 lines to a custom file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-acp-logger-'))
  const path = join(directory, 'nested', 'debug.log')

  try {
    const logger = new DebugLogger(path)
    assert.equal(logger.enabled, true)
    assert.equal(logger.description(), path)

    logger.log('lifecycle', 'ready')
    const bytes = Buffer.from('first € line\r\nunfinished')
    const euro = bytes.indexOf(Buffer.from('€'))
    logger.chunk('stream', bytes.subarray(0, euro + 1))
    logger.chunk('stream', bytes.subarray(euro + 1))
    logger.close()
    logger.close()

    const output = readFileSync(path, 'utf8')
    assert.match(output, /\[lifecycle\] ready\n/)
    assert.match(output, /\[stream\] first € line\n/)
    assert.match(output, /\[stream\] unfinished\n/)
    assert.match(output, /\[adapter\] debug logging started \(destination=.*debug\.log\)\n/)
    assert.match(output, /\[adapter\] debug logging stopped\n/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
