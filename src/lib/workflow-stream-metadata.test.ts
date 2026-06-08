import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractWorkflowSuspendFromChunk,
  shouldReplacePendingApproval,
} from './workflow-stream-metadata'

test('extractWorkflowSuspendFromChunk ignores stale clarification payload on successful step', () => {
  const result = extractWorkflowSuspendFromChunk({
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
  })

  assert.ok(result)
  assert.equal(
    (result.payload as { approvalType?: string }).approvalType,
    'sql-approval',
  )
})

test('shouldReplacePendingApproval prevents same-run approval stage regression', () => {
  assert.equal(
    shouldReplacePendingApproval({
      existing: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-id',
        payload: {
          approvalType: 'sql-approval',
          sql: 'select 1',
        },
      },
      incoming: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-id',
        payload: {
          approvalType: 'intent-clarification',
        },
      },
    }),
    false,
  )
})

test('shouldReplacePendingApproval allows sql regeneration clarification after sql approval', () => {
  assert.equal(
    shouldReplacePendingApproval({
      existing: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-id',
        payload: {
          approvalType: 'sql-approval',
          sql: 'select 1',
        },
      },
      incoming: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-id',
        payload: {
          approvalType: 'intent-clarification',
          clarificationStage: 'sql-regeneration',
        },
      },
    }),
    true,
  )
})

test('shouldReplacePendingApproval allows same-run forward approval stage', () => {
  assert.equal(
    shouldReplacePendingApproval({
      existing: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-id',
        payload: {
          approvalType: 'intent-clarification',
        },
      },
      incoming: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-id',
        payload: {
          approvalType: 'sql-approval',
          sql: 'select 1',
        },
      },
    }),
    true,
  )
})

test('extractWorkflowSuspendFromChunk ignores stale higher-step payload on successful step', () => {
  const result = extractWorkflowSuspendFromChunk({
    type: 'data-workflow',
    id: 'workflow-run-id',
    data: {
      name: 'data-analysis-report',
      status: 'suspended',
      steps: {
        'generate-sql': {
          status: 'suspended',
          suspendPayload: {
            approvalType: 'intent-clarification',
            clarificationStage: 'sql-regeneration',
            reason: 'need sql rewrite clarification',
          },
        },
        'human-approval': {
          status: 'success',
          suspendPayload: {
            approvalType: 'sql-approval',
            sql: 'old sql',
          },
        },
      },
    },
  })

  assert.ok(result)
  assert.equal(
    (result.payload as { clarificationStage?: string }).clarificationStage,
    'sql-regeneration',
  )
})
