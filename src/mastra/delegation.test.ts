import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  filterDelegationMessages,
  onDelegationComplete,
  onDelegationStart,
} from './delegation'

function withAuditEnvironment<T>(run: (lines: string[]) => T): T {
  const previousEnabled = process.env.BABATA_AUDIT_LOG
  const previousFile = process.env.BABATA_AUDIT_LOG_FILE
  const originalInfo = console.info
  const lines: string[] = []
  const tempDir = mkdtempSync(join(tmpdir(), 'babata-delegation-audit-'))
  process.env.BABATA_AUDIT_LOG = 'true'
  process.env.BABATA_AUDIT_LOG_FILE = join(tempDir, 'audit.log')
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }

  try {
    return run(lines)
  } finally {
    console.info = originalInfo
    if (previousEnabled === undefined) {
      delete process.env.BABATA_AUDIT_LOG
    } else {
      process.env.BABATA_AUDIT_LOG = previousEnabled
    }
    if (previousFile === undefined) {
      delete process.env.BABATA_AUDIT_LOG_FILE
    } else {
      process.env.BABATA_AUDIT_LOG_FILE = previousFile
    }
    rmSync(tempDir, { recursive: true, force: true })
  }
}

test('babata delegation allows ximo to return clarification questions', () => {
  const result = onDelegationStart({
    primitiveId: 'ximo',
    primitiveType: 'agent',
    iteration: 1,
    runId: 'run-1',
    threadId: 'thread-1',
    prompt: '分析语音房趋势',
  } as never)

  assert.ok(result)
  assert.match(String(result.modifiedPrompt), /需要澄清/)
  assert.match(String(result.modifiedPrompt), /不要执行 SQL/)
  assert.match(String(result.modifiedPrompt), /文本追问用户/)
  assert.match(String(result.modifiedPrompt), /不要调用 workflow/)
  assert.match(String(result.modifiedPrompt), /不要输出.*审批载荷/)
})

test('babata delegation does not reject ximo clarification response', () => {
  const result = onDelegationComplete({
    primitiveId: 'ximo',
    primitiveType: 'agent',
    success: true,
    duration: 100,
    iteration: 1,
    runId: 'run-1',
    result: {
      text: '需要澄清：\n- 请确认目标表\n- 请确认指标字段',
    },
  } as never)

  assert.equal(result, undefined)
})

test('babata delegation accepts natural language ximo clarification questions', () => {
  const result = onDelegationComplete({
    primitiveId: 'ximo',
    primitiveType: 'agent',
    success: true,
    duration: 100,
    iteration: 1,
    runId: 'run-1',
    result: {
      text: '请确认目标表、指标字段和时间范围，我再继续查询。',
    },
  } as never)

  assert.equal(result, undefined)
})

test('babata ximo delegation audit logs full prompt and result', () => {
  withAuditEnvironment((lines) => {
    onDelegationStart({
      primitiveId: 'ximo',
      primitiveType: 'agent',
      iteration: 1,
      runId: 'run-audit',
      threadId: 'thread-audit',
      prompt: '请分析语音房收入，重点看最近 7 天趋势和 top 房间',
    } as never)
    onDelegationComplete({
      primitiveId: 'ximo',
      primitiveType: 'agent',
      success: true,
      duration: 100,
      iteration: 1,
      runId: 'run-audit',
      result: {
        text: '需要澄清：请确认目标表、指标字段和时间范围。',
      },
    } as never)

    const auditPayloads = lines
      .map(
        (line) =>
          JSON.parse(line) as {
            component?: string
            event?: string
            prompt?: string
            resultText?: string
          },
      )
      .filter((payload) => payload.component === 'babata-audit')

    assert.ok(
      auditPayloads.some(
        (payload) =>
          payload.event === 'babata-ximo.prompt' &&
          payload.prompt === '请分析语音房收入，重点看最近 7 天趋势和 top 房间',
      ),
    )
    assert.ok(
      auditPayloads.some(
        (payload) =>
          payload.event === 'babata-ximo.result' &&
          payload.resultText === '需要澄清：请确认目标表、指标字段和时间范围。',
      ),
    )
  })
})

test('babata ximo delegation audit logs context messages', () => {
  withAuditEnvironment((lines) => {
    filterDelegationMessages({
      primitiveId: 'ximo',
      primitiveType: 'agent',
      messages: [
        { role: 'user', content: '帮我查语音房收入' },
        { role: 'assistant', content: '需要澄清：请确认时间范围' },
        { role: 'user', content: '最近 7 天' },
      ],
    } as never)

    const auditPayload = lines
      .map(
        (line) =>
          JSON.parse(line) as {
            component?: string
            event?: string
            messages?: Array<{ role: string; text: string }>
          },
      )
      .find(
        (payload) =>
          payload.component === 'babata-audit' &&
          payload.event === 'babata-ximo.context',
      )

    assert.ok(auditPayload)
    assert.deepEqual(
      auditPayload.messages?.map((message) => message.text),
      ['帮我查语音房收入', '需要澄清：请确认时间范围', '最近 7 天'],
    )
  })
})

test('babata delegation constrains hundun to context evidence', () => {
  const result = onDelegationStart({
    primitiveId: 'hundun',
    primitiveType: 'agent',
    iteration: 1,
    runId: 'run-hundun',
    threadId: 'thread-hundun',
    prompt: '用户想分析语音房钻石流水，先确认口径和源表',
  } as never)

  assert.ok(result)
  assert.match(String(result.modifiedPrompt), /上下文证据包/)
  assert.match(String(result.modifiedPrompt), /不执行.*SQL/)
  assert.match(String(result.modifiedPrompt), /未配置/)
  assert.match(String(result.modifiedPrompt), /来源/)
  assert.equal(result.modifiedMaxSteps, 8)
})

test('babata delegation keeps pure lineage searches direct and lightweight', () => {
  const result = onDelegationStart({
    primitiveId: 'hundun',
    primitiveType: 'agent',
    iteration: 1,
    runId: 'run-hundun-lineage',
    threadId: 'thread-hundun-lineage',
    prompt: '查 ads_doris_peanut_voice_room_daily 的数据血缘',
  } as never)

  assert.ok(result)
  assert.match(String(result.modifiedPrompt), /血缘.*专用路径/)
  assert.match(String(result.modifiedPrompt), /query-data-lineage/)
  assert.match(String(result.modifiedPrompt), /graph/)
  assert.match(String(result.modifiedPrompt), /不做.*数据分析|不做.*业务推理/)
})

test('babata hundun delegation audit logs context prompt and result', () => {
  withAuditEnvironment((lines) => {
    filterDelegationMessages({
      primitiveId: 'hundun',
      primitiveType: 'agent',
      messages: [
        { role: 'user', content: '帮我确认钻石流水口径' },
        { role: 'assistant', content: '我先找上下文证据' },
      ],
    } as never)
    onDelegationStart({
      primitiveId: 'hundun',
      primitiveType: 'agent',
      iteration: 1,
      runId: 'run-hundun-audit',
      threadId: 'thread-hundun-audit',
      prompt: '请查找钻石流水的口径、候选表和源 SQL',
    } as never)
    onDelegationComplete({
      primitiveId: 'hundun',
      primitiveType: 'agent',
      success: true,
      duration: 100,
      iteration: 1,
      runId: 'run-hundun-audit',
      result: {
        text: '## 混沌上下文证据包\n\n### 候选表与字段\n- 未找到证据',
      },
    } as never)

    const auditPayloads = lines
      .map(
        (line) =>
          JSON.parse(line) as {
            component?: string
            event?: string
            prompt?: string
            modifiedPrompt?: string
            resultText?: string | null
            messages?: Array<{ role: string; text: string }>
          },
      )
      .filter((payload) => payload.component === 'babata-audit')

    assert.ok(
      auditPayloads.some(
        (payload) =>
          payload.event === 'babata-hundun.context' &&
          payload.messages?.[0]?.text === '帮我确认钻石流水口径',
      ),
    )
    assert.ok(
      auditPayloads.some(
        (payload) =>
          payload.event === 'babata-hundun.prompt' &&
          payload.prompt === '请查找钻石流水的口径、候选表和源 SQL',
      ),
    )
    assert.ok(
      auditPayloads.some(
        (payload) =>
          payload.event === 'babata-hundun.modified-prompt' &&
          /上下文证据包/.test(String(payload.modifiedPrompt)),
      ),
    )
    assert.ok(
      auditPayloads.some(
        (payload) =>
          payload.event === 'babata-hundun.result' &&
          payload.resultText?.includes('混沌上下文证据包'),
      ),
    )
  })
})

test('babata hundun delegation failure feeds back without fabrication', () => {
  const result = onDelegationComplete({
    primitiveId: 'hundun',
    primitiveType: 'agent',
    success: false,
    duration: 100,
    iteration: 1,
    runId: 'run-hundun-failed',
    error: new Error('RAG endpoint unavailable'),
  } as never)

  assert.ok(result)
  assert.match(String(result.feedback), /混沌/)
  assert.match(String(result.feedback), /勿编造|不要编造/)
})
