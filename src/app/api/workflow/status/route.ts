import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { mastra } from '@/mastra'

const WORKFLOW_KEYS: Record<string, string> = {
  'data-analysis-report': 'dataAnalysisReport',
  dataAnalysisReport: 'dataAnalysisReport',
  'weekly-metrics': 'weeklyMetrics',
  weeklyMetrics: 'weeklyMetrics',
}

export async function GET(req: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session

  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')
  const workflowId = searchParams.get('workflowId') ?? 'data-analysis-report'

  if (!runId) {
    return Response.json({ error: '缺少 runId' }, { status: 400 })
  }

  const key = (WORKFLOW_KEYS[workflowId] ?? 'dataAnalysisReport') as
    | 'dataAnalysisReport'
    | 'dataAnalysisPrep'
    | 'weeklyMetrics'
  const workflow = mastra.getWorkflow(key)
  if (!workflow) {
    return Response.json({ error: 'Workflow 不存在' }, { status: 404 })
  }

  try {
    const state = await workflow.getWorkflowRunById(runId, {
      withNestedWorkflows: true,
      fields: ['steps', 'payload', 'result', 'error'],
    })

    if (!state) {
      return Response.json({ error: '未找到运行记录' }, { status: 404 })
    }

    return Response.json({
      runId: state.runId,
      workflowName: state.workflowName,
      status: state.status,
      updatedAt: state.updatedAt,
      steps: state.steps ?? {},
      error: state.error?.message,
    })
  } catch (error) {
    console.error('[GET /api/workflow/status]', error)
    const message = error instanceof Error ? error.message : '查询失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
