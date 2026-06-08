import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveIntentClarificationDialogState } from './intent-clarification-dialog-state'

const pendingApproval = {
  workflowId: 'data-analysis-report',
  workflowRunId: 'workflow-run-1',
}

const payload = {
  approvalType: 'intent-clarification',
  clarificationStage: 'intent-disambiguation',
}

test('ignores latched clarification after live pending approval is cleared', () => {
  const state = resolveIntentClarificationDialogState({
    pendingApproval: undefined,
    payloadFromPending: null,
    latchedPendingApproval: pendingApproval,
    latchedPayload: payload,
    loading: false,
  })

  assert.equal(state.effectivePendingApproval, undefined)
  assert.equal(state.payload, null)
})

test('keeps latched clarification while submit is still loading', () => {
  const state = resolveIntentClarificationDialogState({
    pendingApproval: undefined,
    payloadFromPending: null,
    latchedPendingApproval: pendingApproval,
    latchedPayload: payload,
    loading: true,
  })

  assert.equal(state.effectivePendingApproval, pendingApproval)
  assert.equal(state.payload, payload)
})
