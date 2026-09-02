import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWorkflowResumePath } from './workflow-resume-path'

test('query-normalization always resumes via agent even if workflowRunId is set', () => {
  assert.equal(
    resolveWorkflowResumePath({
      workflowId: 'query-normalization',
      workflowRunId: 'agent-run-mistakenly-as-workflow',
      agentRunId: 'agent-run-1',
    }),
    'agent',
  )
})

test('real workflow resume uses workflow path when workflowRunId present', () => {
  assert.equal(
    resolveWorkflowResumePath({
      workflowId: 'data-analysis-report',
      workflowRunId: 'wf-1',
      agentRunId: 'agent-1',
    }),
    'workflow',
  )
})

test('agent-only suspend uses agent path', () => {
  assert.equal(
    resolveWorkflowResumePath({
      workflowId: 'query-normalization',
      workflowRunId: null,
      agentRunId: 'agent-1',
    }),
    'agent',
  )
})
