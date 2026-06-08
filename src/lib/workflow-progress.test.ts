import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPendingApprovalToProgress,
  extractWorkflowReportFromParts,
  extractWorkflowSuspendSyncContext,
  parseWorkflowProgressFromParts,
} from './workflow-progress'

test('extractWorkflowSuspendSyncContext prefers few-shot suspend payload', () => {
  const parts: unknown[] = [
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'human-approval': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'sql-approval',
              sql: 'select 1',
              intentSummary: 'test',
            },
          },
          'few-shot-approval': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'few-shot-save',
              draft: {
                originalQuestion: 'q',
                finalIntentSummary: 'summary',
                clarificationRecord: 'none',
                generatedSql: 'select 1',
                reportMarkdown: '# report',
                generatedAt: '2026-06-04T00:00:00.000Z',
              },
            },
          },
        },
      },
    },
  ]

  const context = extractWorkflowSuspendSyncContext(parts)
  assert.ok(context)
  assert.equal(
    (context.payload as { approvalType?: string }).approvalType,
    'few-shot-save',
  )
})

test('extractWorkflowReportFromParts falls back to few-shot draft report', () => {
  const parts: unknown[] = [
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'few-shot-approval': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'few-shot-save',
              draft: {
                originalQuestion: 'q',
                finalIntentSummary: 'summary',
                clarificationRecord: 'none',
                generatedSql: 'select 1',
                reportMarkdown: '## 最终报告',
                generatedAt: '2026-06-04T00:00:00.000Z',
              },
            },
          },
        },
      },
    },
  ]

  const report = extractWorkflowReportFromParts(parts)
  assert.equal(report, '## 最终报告')
})

test('extractWorkflowSuspendSyncContext prefers intent clarification over stale sql step', () => {
  const parts: unknown[] = [
    {
      type: 'data-workflow-step',
      id: 'workflow-run-id:human-approval',
      data: {
        name: 'data-analysis-report',
        stepId: 'human-approval',
        step: {
          status: 'suspended',
          suspendPayload: {
            approvalType: 'sql-approval',
            sql: 'select 1',
            intentSummary: 'old snapshot',
          },
        },
      },
    },
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'fetch-schema': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'intent-clarification',
              reason: '请补充字段',
              requiredFields: ['dimensions', 'metrics'],
            },
          },
        },
      },
    },
  ]

  const context = extractWorkflowSuspendSyncContext(parts)
  assert.ok(context)
  assert.equal(
    (context.payload as { approvalType?: string }).approvalType,
    'intent-clarification',
  )
})

test('extractWorkflowSuspendSyncContext prefers later suspended step in workflow order', () => {
  const parts: unknown[] = [
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'fetch-schema': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'intent-clarification',
              clarificationStage: 'intent-disambiguation',
              reason: '请确认目标表',
            },
          },
          'human-approval': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'sql-approval',
              sql: 'select 1',
              intentSummary: 'sql review',
            },
          },
        },
      },
    },
  ]

  const context = extractWorkflowSuspendSyncContext(parts)
  assert.ok(context)
  assert.equal(
    (context.payload as { approvalType?: string }).approvalType,
    'sql-approval',
  )
})

test('extractWorkflowSuspendSyncContext ignores stale clarification payload on successful step', () => {
  const parts: unknown[] = [
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'fetch-schema': {
            status: 'success',
            suspendPayload: {
              approvalType: 'intent-clarification',
              reason: 'old clarification',
            },
          },
          'human-approval': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'sql-approval',
              sql: 'select 1',
              intentSummary: 'pending review',
            },
          },
        },
      },
    },
  ]

  const context = extractWorkflowSuspendSyncContext(parts)
  assert.ok(context)
  assert.equal(
    (context.payload as { approvalType?: string }).approvalType,
    'sql-approval',
  )
})

test('parseWorkflowProgressFromParts marks earlier suspended steps as success', () => {
  const parts: unknown[] = [
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'parse-intent': { status: 'success' },
          'fetch-schema': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'intent-clarification',
              reason: 'stale payload',
            },
          },
          'generate-sql': { status: 'success' },
          'human-approval': {
            status: 'suspended',
            suspendPayload: {
              approvalType: 'sql-approval',
              sql: 'select 1',
              intentSummary: 'pending review',
            },
          },
        },
      },
    },
  ]

  const progress = parseWorkflowProgressFromParts(parts)
  assert.ok(progress)
  assert.equal(progress.currentStepId, 'human-approval')
  assert.equal(
    progress.steps.find((step) => step.id === 'fetch-schema')?.status,
    'success',
  )
  assert.equal(
    progress.steps.find((step) => step.id === 'human-approval')?.status,
    'suspended',
  )
})

test('applyPendingApprovalToProgress builds resumeContext from pending approval when missing', () => {
  const baseProgress = parseWorkflowProgressFromParts([
    {
      type: 'data-workflow',
      id: 'workflow-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'parse-intent': { status: 'success' },
          'fetch-schema': { status: 'success' },
          'generate-sql': { status: 'success' },
          'human-approval': { status: 'suspended' },
        },
      },
    },
  ])
  assert.ok(baseProgress)
  assert.equal(baseProgress.resumeContext, undefined)

  const next = applyPendingApprovalToProgress(baseProgress, {
    workflowId: 'data-analysis-report',
    payload: {
      approvalType: 'sql-approval',
      sql: 'SELECT 1',
      intentSummary: 'test intent',
      sqlRevisionCount: 2,
    },
  })

  assert.ok(next.resumeContext)
  assert.equal(next.resumeContext?.sql, 'SELECT 1')
  assert.equal(next.resumeContext?.intentSummary, 'test intent')
  assert.equal(next.resumeContext?.sqlRevisionCount, 2)
  assert.equal(next.resumeContext?.workflowId, 'data-analysis-report')
})

test('applyPendingApprovalToProgress ignores pending approval from different workflow run', () => {
  const baseProgress = parseWorkflowProgressFromParts([
    {
      type: 'data-workflow',
      id: 'current-run-id',
      data: {
        name: 'data-analysis-report',
        status: 'suspended',
        steps: {
          'parse-intent': { status: 'success' },
          'fetch-schema': { status: 'suspended' },
        },
      },
    },
  ])
  assert.ok(baseProgress)
  assert.equal(baseProgress.workflowRunId, 'current-run-id')

  const next = applyPendingApprovalToProgress(baseProgress, {
    workflowId: 'data-analysis-report',
    workflowRunId: 'stale-run-id',
    payload: {
      approvalType: 'sql-approval',
      sql: 'SELECT 1',
      intentSummary: 'stale',
    },
  })

  assert.equal(next.resumeContext, undefined)
  assert.equal(next.sqlPreview, undefined)
  assert.equal(next.clarificationHint, undefined)
  assert.equal(next.steps.find((step) => step.id === 'fetch-schema')?.status, 'suspended')
})

test('applyPendingApprovalToProgress treats metadata sql approval as suspended truth', () => {
  const baseProgress = parseWorkflowProgressFromParts([
    {
      type: 'data-workflow',
      id: 'workflow-run-1',
      data: {
        name: 'data-analysis-report',
        status: 'running',
        steps: {
          'parse-intent': { status: 'success' },
          'fetch-schema': { status: 'success' },
          'generate-sql': { status: 'success' },
          'human-approval': { status: 'pending' },
        },
      },
    },
  ])
  assert.ok(baseProgress)

  const next = applyPendingApprovalToProgress(baseProgress, {
    workflowId: 'data-analysis-report',
    workflowRunId: 'workflow-run-1',
    payload: {
      approvalType: 'sql-approval',
      sql: 'SELECT 1',
      intentSummary: 'test intent',
      sqlRevisionCount: 1,
    },
  })

  assert.equal(next.runStatus, 'suspended')
  assert.equal(next.sqlPreview, 'SELECT 1')
  assert.equal(next.resumeContext?.sql, 'SELECT 1')
  assert.equal(next.resumeContext?.workflowRunId, 'workflow-run-1')
  assert.equal(
    next.steps.find((step) => step.id === 'human-approval')?.status,
    'suspended',
  )
})

test('applyPendingApprovalToProgress does not revive terminal workflow progress', () => {
  const baseProgress = parseWorkflowProgressFromParts([
    {
      type: 'data-workflow',
      id: 'workflow-run-1',
      data: {
        name: 'data-analysis-report',
        status: 'success',
        steps: {
          'parse-intent': { status: 'success' },
          'fetch-schema': { status: 'success' },
          'generate-sql': { status: 'success' },
          'human-approval': { status: 'success' },
        },
      },
    },
  ])
  assert.ok(baseProgress)

  const next = applyPendingApprovalToProgress(baseProgress, {
    workflowId: 'data-analysis-report',
    workflowRunId: 'workflow-run-1',
    payload: {
      approvalType: 'sql-approval',
      sql: 'SELECT 1',
      intentSummary: 'stale approval',
    },
  })

  assert.equal(next.runStatus, 'success')
  assert.equal(next.sqlPreview, undefined)
  assert.equal(next.resumeContext, undefined)
})
