import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakePiRpcProcess, asAgentConn } from '../helpers/fakes.js'

test('PiAcpSession: completes side-effect-only extension commands without agent_settled', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakePiRpcProcess()
  const session = new PiAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn)
  })
  session.setExtensionCommandNames(['sandbox'])

  const reason = await session.prompt('/sandbox')

  assert.equal(reason, 'end_turn')
  assert.deepEqual(proc.prompts, [{ message: '/sandbox', attachments: [] }])
})
