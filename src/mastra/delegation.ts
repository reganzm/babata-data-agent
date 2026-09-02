import type {
  DelegationCompleteContext,
  DelegationStartContext,
  DelegationStartResult,
  MessageFilterContext,
} from '@mastra/core/agent'
import type { MastraDBMessage } from '@mastra/core/agent'
import { logAuditEvent } from '@/lib/audit-log'
import { agentRegistry } from './registry'

function lastMessages(messages: MastraDBMessage[], n: number): MastraDBMessage[] {
  return messages.slice(-n)
}

function getLastN(): number {
  const n = Number(process.env.MEMORY_LAST_MESSAGES ?? '20')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20
}

function logDelegation(event: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: 'babata-delegation',
      event,
      ...payload,
    }),
  )
}

function extractMessageText(message: MastraDBMessage): string {
  const data = message as {
    content?: unknown
    parts?: Array<{ type?: string; text?: string }>
  }
  if (typeof data.content === 'string') return data.content
  if (Array.isArray(data.parts)) {
    return data.parts
      .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
      .filter(Boolean)
      .join('\n')
  }
  if (data.content === undefined || data.content === null) return ''
  return typeof data.content === 'object'
    ? JSON.stringify(data.content)
    : String(data.content)
}

function summarizeMessages(messages: MastraDBMessage[]) {
  return messages.map((message, index) => ({
    index,
    role: message.role,
    text: extractMessageText(message),
  }))
}

function isXimoClarificationResponse(text: string): boolean {
  if (text.includes('需要澄清')) return true
  return (
    /请(确认|补充|提供|选择|说明)/.test(text) &&
    /(目标表|表名|指标|字段|时间范围|时间|维度|过滤条件)/.test(text)
  )
}

export function filterDelegationMessages({
  messages,
  primitiveId,
  primitiveType,
}: MessageFilterContext): MastraDBMessage[] {
  const n = getLastN()
  const recent = lastMessages(messages, n)

  if (primitiveType === 'workflow' || primitiveId.includes('workflow')) {
    const users = recent.filter((m) => m.role === 'user')
    const lastUser = users.at(-1)
    const system = recent.filter((m) => m.role === 'system').at(-1)
    return [system, lastUser].filter(Boolean) as MastraDBMessage[]
  }

  if (primitiveId.includes('hundun')) {
    logAuditEvent({
      event: 'babata-hundun.context',
      primitiveId,
      primitiveType,
      messageCount: recent.length,
      messages: summarizeMessages(recent),
    })
    return recent
  }

  if (primitiveId.includes('chestnut')) {
    return recent.filter(
      (m) =>
        m.role === 'user' ||
        m.role === 'assistant' ||
        m.role === 'system',
    )
  }

  if (primitiveId.includes('ximo')) {
    logAuditEvent({
      event: 'babata-ximo.context',
      primitiveId,
      primitiveType,
      messageCount: recent.length,
      messages: summarizeMessages(recent),
    })
    return recent
  }

  if (primitiveId.includes('juju')) {
    return recent
  }

  return recent
}

export function onDelegationStart(
  ctx: DelegationStartContext,
): DelegationStartResult | void {
  if (ctx.primitiveId.includes('ximo')) {
    logAuditEvent({
      event: 'babata-ximo.prompt',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      iteration: ctx.iteration,
      runId: ctx.runId,
      threadId: ctx.threadId,
      prompt: ctx.prompt,
    })
  }
  if (ctx.primitiveId.includes('hundun')) {
    logAuditEvent({
      event: 'babata-hundun.prompt',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      iteration: ctx.iteration,
      runId: ctx.runId,
      threadId: ctx.threadId,
      prompt: ctx.prompt,
    })
  }
  if (ctx.primitiveId.includes('juju')) {
    logAuditEvent({
      event: 'babata-juju.prompt',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      iteration: ctx.iteration,
      runId: ctx.runId,
      threadId: ctx.threadId,
      prompt: ctx.prompt,
    })
  }
  logDelegation('start', {
    primitiveId: ctx.primitiveId,
    primitiveType: ctx.primitiveType,
    iteration: ctx.iteration,
    runId: ctx.runId,
    threadId: ctx.threadId,
    promptPreview:
      typeof ctx.prompt === 'string'
        ? ctx.prompt.slice(0, 200)
        : String(ctx.prompt).slice(0, 200),
  })

  if (ctx.primitiveId.includes('ximo')) {
    const suffix =
      '\n\n【总管约束】优先使用 list-tables / describe-table / execute-readonly-sql / build-visualization；禁止编造未执行的数据。若目标表、维度、指标字段、时间范围不明确，用自然语言文本追问用户，允许直接返回“需要澄清”问题，不要执行 SQL，不要调用 workflow，不要调用 build-visualization，不要输出 workflow 审批载荷，不要输出 JSON 摘要块。用户补充后，根据同一会话上下文继续分析。SQL 执行后必须调用 build-visualization 并附上 vizBlock；输出 JSON 摘要块。'
    const modifiedPrompt =
      typeof ctx.prompt === 'string'
        ? ctx.prompt +
          suffix +
          '\n\n【可视化】JSON 块中请包含 execute-readonly-sql 的 rows（最多 100 行），前端将自动生成图表。'
        : ctx.prompt
    logAuditEvent({
      event: 'babata-ximo.modified-prompt',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      iteration: ctx.iteration,
      runId: ctx.runId,
      threadId: ctx.threadId,
      modifiedPrompt,
    })
    return {
      modifiedPrompt,
      modifiedMaxSteps: 8,
    }
  }

  if (ctx.primitiveId.includes('hundun')) {
    const suffix =
      '\n\n【总管约束】你是上下文侦察助手。若用户只是在查血缘、搜血缘、看血缘或查看某表上下游关系，走血缘查询专用路径：只调用 query-data-lineage，只返回表级有向 graph 图和源表/目标表表格；不要委派西莫，不执行任何查数 SQL，不调用 build-visualization，不做复杂数据分析或业务推理，不写总结或摘要。查询命中时只原样输出 query-data-lineage 返回的 babata-viz 图表块；未命中或接口不可用时只用一句话说明原因。其他上下文侦察需求返回“混沌上下文证据包”，必须围绕指标口径、表字段含义、数据血缘、RAG 知识库、源 SQL 或源码片段收集证据；每条关键判断必须附来源。工具或数据源未配置时必须明确说明“未配置”或“不可用”，不得编造 RAG、血缘、源 SQL、源码或表字段证据。'
    const modifiedPrompt =
      typeof ctx.prompt === 'string' ? ctx.prompt + suffix : ctx.prompt
    logAuditEvent({
      event: 'babata-hundun.modified-prompt',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      iteration: ctx.iteration,
      runId: ctx.runId,
      threadId: ctx.threadId,
      modifiedPrompt,
    })
    return {
      modifiedPrompt,
      modifiedMaxSteps: 8,
    }
  }

  if (ctx.primitiveId.includes('juju')) {
    const suffix =
      '\n\n【总管约束】你是埋点验收专家。必须通过 event-tracking-query 工具查询真实上报数据，禁止编造埋点数量或字段取值；验收范围仅系统当天（ds 固定为今天 Asia/Shanghai YYYYMMDD，由工具自动填入，不查历史/多天，即使 prompt 提到「最近 N 天」也只按当天核验）；返回行数上限 1000 行；验收前必须先从文档识别埋点版本号，识别不到则停下用自然语言向用户澄清追问、不得默认全量；确认版本号后以 major.minor.patch 字符串通过 minAppVersion 传入（工具内部转 app_version_code 比较）；验收前先用 list-app-keys 拿 peanut 的 app_key 再按 appKeys 过滤；产出结构化验收报告（Markdown 表格），并在 caveats 说明验收范围为当天。'
    const modifiedPrompt =
      typeof ctx.prompt === 'string' ? ctx.prompt + suffix : ctx.prompt
    return {
      modifiedPrompt,
      modifiedMaxSteps: 12,
    }
  }

  if (
    ctx.primitiveType === 'workflow' ||
    ctx.primitiveId.includes('workflow') ||
    ctx.primitiveId.includes('dataAnalysisReport') ||
    ctx.primitiveId.includes('weeklyMetrics')
  ) {
    const suffix =
      '\n\n【Workflow 入参】调用时必须传对象：{"userQuery":"用户完整需求"}，禁止 inputData 为纯字符串。'
    return {
      modifiedMaxSteps: 15,
      modifiedPrompt:
        typeof ctx.prompt === 'string' ? ctx.prompt + suffix : ctx.prompt,
    }
  }

  return undefined
}

export function onDelegationComplete(ctx: DelegationCompleteContext): {
  feedback?: string
} | void {
  if (ctx.primitiveId.includes('ximo')) {
    logAuditEvent({
      event: 'babata-ximo.result',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      success: ctx.success,
      durationMs: ctx.duration,
      iteration: ctx.iteration,
      runId: ctx.runId,
      resultText: ctx.result?.text ?? null,
      error: ctx.error?.message ?? null,
    })
  }
  if (ctx.primitiveId.includes('hundun')) {
    logAuditEvent({
      event: 'babata-hundun.result',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      success: ctx.success,
      durationMs: ctx.duration,
      iteration: ctx.iteration,
      runId: ctx.runId,
      resultText: ctx.result?.text ?? null,
      error: ctx.error?.message ?? null,
    })
  }
  if (ctx.primitiveId.includes('juju')) {
    logAuditEvent({
      event: 'babata-juju.result',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      success: ctx.success,
      durationMs: ctx.duration,
      iteration: ctx.iteration,
      runId: ctx.runId,
      resultText: ctx.result?.text ?? null,
      error: ctx.error?.message ?? null,
    })
  }
  logDelegation('complete', {
    primitiveId: ctx.primitiveId,
    primitiveType: ctx.primitiveType,
    success: ctx.success,
    durationMs: ctx.duration,
    iteration: ctx.iteration,
    runId: ctx.runId,
    resultPreview: ctx.result?.text?.slice(0, 300),
    error: ctx.error?.message,
  })

  if (!ctx.success) {
    const agent =
      Object.values(agentRegistry).find((a) =>
        ctx.primitiveId.includes(a.id),
      )?.name ?? ctx.primitiveId
    const feedback = `委派 ${agent} 失败：${ctx.error?.message ?? '未知错误'}。请勿编造数据，请向用户说明失败原因或换用其他方式。`
    if (ctx.primitiveId.includes('ximo')) {
      logAuditEvent({
        event: 'babata-ximo.feedback',
        primitiveId: ctx.primitiveId,
        primitiveType: ctx.primitiveType,
        runId: ctx.runId,
        feedback,
      })
    }
    if (ctx.primitiveId.includes('hundun')) {
      logAuditEvent({
        event: 'babata-hundun.feedback',
        primitiveId: ctx.primitiveId,
        primitiveType: ctx.primitiveType,
        runId: ctx.runId,
        feedback,
      })
    }
    if (ctx.primitiveId.includes('juju')) {
      logAuditEvent({
        event: 'babata-juju.feedback',
        primitiveId: ctx.primitiveId,
        primitiveType: ctx.primitiveType,
        runId: ctx.runId,
        feedback,
      })
    }
    return {
      feedback,
    }
  }

  if (
    ctx.primitiveId.includes('ximo') &&
    ctx.result?.text &&
    !isXimoClarificationResponse(ctx.result.text) &&
    !/\d/.test(ctx.result.text) &&
    !ctx.result.text.includes('execute-readonly-sql')
  ) {
    logAuditEvent({
      event: 'babata-ximo.feedback',
      primitiveId: ctx.primitiveId,
      primitiveType: ctx.primitiveType,
      runId: ctx.runId,
      feedback: '西莫回复中未见明确数据结果，请确认是否已调用 execute-readonly-sql，勿编造指标。',
    })
    return {
      feedback:
        '西莫回复中未见明确数据结果，请确认是否已调用 execute-readonly-sql，勿编造指标。',
    }
  }

  return undefined
}

export const babataDelegationConfig = {
  messageFilter: filterDelegationMessages,
  onDelegationStart,
  onDelegationComplete,
}
