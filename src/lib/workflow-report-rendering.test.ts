import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldRenderWorkflowReport } from './workflow-report-rendering'

test('renders report for completed workflow even when original assistant text exists', () => {
  assert.equal(
    shouldRenderWorkflowReport({
      reportMarkdown: '## report',
      runStatus: 'success',
      hasTextPart: true,
    }),
    true,
  )
})

test('does not render report while workflow is still running and text exists', () => {
  assert.equal(
    shouldRenderWorkflowReport({
      reportMarkdown: '## report',
      runStatus: 'running',
      hasTextPart: true,
    }),
    false,
  )
})
