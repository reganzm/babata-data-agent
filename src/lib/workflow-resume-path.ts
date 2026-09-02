import type { WorkflowResumeContext } from '@/lib/workflow-progress'

/** Agent 工具挂起（非 Mastra Workflow）使用的伪 workflowId */
export const AGENT_TOOL_SUSPEND_WORKFLOW_IDS = new Set(['query-normalization'])

/**
 * 决定审批恢复走 Workflow resume 还是 Agent chat resume。
 * query-normalization 是巴巴塔工具 suspend，不是真实 Workflow。
 */
export function resolveWorkflowResumePath(
  context: Pick<
    WorkflowResumeContext,
    'workflowId' | 'workflowRunId' | 'agentRunId'
  >,
): 'workflow' | 'agent' {
  if (AGENT_TOOL_SUSPEND_WORKFLOW_IDS.has(context.workflowId)) {
    if (!context.agentRunId) {
      throw new Error('缺少 agent runId，无法恢复查询规范化确认')
    }
    return 'agent'
  }
  if (context.workflowRunId) return 'workflow'
  if (context.agentRunId) return 'agent'
  throw new Error('缺少 workflowRunId，无法恢复审批流程')
}
