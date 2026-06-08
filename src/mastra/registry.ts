/**
 * Agent / Workflow 注册表 — 生成总管 instructions 与路由元数据
 */

import { babataDescription } from './instructions/babata'
import { chestnutDescription } from './instructions/chestnut'
import { hundunDescription } from './instructions/hundun'
import { ximoDescription } from './instructions/ximo'
import { routingDecisionTable } from './instructions/routing'

export { babataDescription }

export type AgentRegistryEntry = {
  id: string
  name: string
  description: string
  delegatePrimitiveId: string
}

export type WorkflowRegistryEntry = {
  id: string
  name: string
  description: string
  triggerPhrases: string[]
  mastraKey: string
}

export const agentRegistry = {
  babata: {
    id: 'babata',
    name: '巴巴塔',
    description: babataDescription,
    delegatePrimitiveId: 'babata',
  },
  ximo: {
    id: 'ximo',
    name: '西莫',
    description: ximoDescription,
    delegatePrimitiveId: 'ximo',
  },
  chestnut: {
    id: 'chestnut',
    name: '小栗子',
    description: chestnutDescription,
    delegatePrimitiveId: 'chestnut',
  },
  hundun: {
    id: 'hundun',
    name: '混沌',
    description: hundunDescription,
    delegatePrimitiveId: 'hundun',
  },
} as const satisfies Record<string, AgentRegistryEntry>

export const workflowRegistry = {
  dataAnalysisReport: {
    id: 'data-analysis-report',
    name: '标准数据分析报告',
    description:
      'Text2SQL → 可选 SQL 审批 → 执行 → 解读（步骤固定，可审计）',
    triggerPhrases: [
      '标准流程',
      '标准分析报告',
      '按规范出报告',
      'Text2SQL 审批',
      'SQL 审批',
    ],
    mastraKey: 'dataAnalysisReport',
  },
  weeklyMetrics: {
    id: 'weekly-metrics',
    name: '周报指标流水线',
    description: '固定周报指标模板：区域销售、周合计、Top 区域',
    triggerPhrases: ['周报', '周报指标', '固定指标模板', '周度指标'],
    mastraKey: 'weeklyMetrics',
  },
} as const satisfies Record<string, WorkflowRegistryEntry>

function buildWorkflowRoutingSection(): string {
  return Object.values(workflowRegistry)
    .map(
      (w) =>
        `- **${w.id}**（${w.name}）：${w.description}；触发词示例：${w.triggerPhrases.join('、')}`,
    )
    .join('\n')
}

/** 由注册表生成巴巴塔 system instructions */
export function buildBabataInstructions(): string {
  const subAgents = [agentRegistry.ximo, agentRegistry.chestnut, agentRegistry.hundun]
    .map((a) => `- **${a.name}**（${a.id}）：${a.description}`)
    .join('\n')

  return `你是巴巴塔（Babata 智囊团总管），负责理解用户需求、路由子能力并汇总最终答复。

## 角色
- 用清晰、专业的中文与用户对话
- 协调子 Agent 与 Workflow，统一对外口吻
- 不确定时如实说明，不要编造事实或数据

## 子 Agent
${subAgents}

## Workflow（固定流水线）
${buildWorkflowRoutingSection()}

## 调用 Workflow 工具（重要）
- 工具名：workflow-dataAnalysisReport 或 workflow-weeklyMetrics（以系统暴露为准）
- inputData 必须是 JSON 对象，且包含 userQuery 字符串字段（用户完整分析需求）
- 错误：把整个 inputData 写成一段纯字符串；应使用 { userQuery: "..." } 结构
- 普通查数澄清不要调用 Workflow；只有用户明确要求“标准流程”“标准分析报告”“Text2SQL 审批”等固定流水线时，才调用 data-analysis-report

## 调用子 Agent 工具（重要）
- 普通委派西莫（ximo）或小栗子（chestnut）时，只传 prompt、threadId、resourceId、instructions、maxSteps 等必要字段。
- 需要查指标口径、字段含义、表含义、数据血缘、RAG 知识库、源 SQL 或源码线索时，优先委派混沌（hundun）收集上下文证据包。
- 查数类需求默认委派西莫；西莫缺少表名、维度、指标、时间范围时，直接文本追问用户，让用户下一条回复进入同一会话上下文后再继续委派西莫。
- 西莫澄清不要启动 data-analysis-report，也不要唤起 workflow 澄清弹窗。
- suspendedToolRunId 仅用于恢复“真实处于 suspended 的子 Agent 工具调用”；如果没有从系统消息中拿到非空 runId，必须省略该字段。
- 不要传 null、"null"、undefined、空字符串作为 suspendedToolRunId；这些值会触发错误的 resumeStream 分支。

${routingDecisionTable}

## 数据与安全
- 数字与 SQL 结论必须来自西莫 tools、或上述 Workflow 执行结果
- 禁止在未委派/未触发流程时编造 SQL 或业务数字

## 输出
- 使用 Markdown
- 可注明分工来源
- 整篇答复 emoji 不超过 2 个（含汇总与子 Agent 原文）
- 保留子 Agent / Workflow 附带的 \`\`\`babata-viz\`\`\` 可视化块，不要删除或改写
- 最终由你交付给用户`
}

export function getDelegationLabel(primitiveId: string): string | undefined {
  const normalized = primitiveId
    .replace(/^agent-/, '')
    .replace(/^workflow-/, '')

  if (normalized === 'ximo' || primitiveId.includes('ximo')) {
    return agentRegistry.ximo.name
  }
  if (normalized === 'chestnut' || primitiveId.includes('chestnut')) {
    return agentRegistry.chestnut.name
  }
  if (normalized === 'hundun' || primitiveId.includes('hundun')) {
    return agentRegistry.hundun.name
  }
  for (const w of Object.values(workflowRegistry)) {
    if (
      primitiveId === w.id ||
      primitiveId.includes(w.id) ||
      primitiveId.includes(w.mastraKey)
    ) {
      return w.name
    }
  }
  return undefined
}
