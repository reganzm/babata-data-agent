import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldApplyInitialTableExpansion,
  resolveInitialTableDetailsExpanded,
} from './table-detail-expansion'

test('defaults report table details to expanded unless explicitly collapsed', () => {
  assert.equal(
    resolveInitialTableDetailsExpanded({
    }),
    true,
  )
  assert.equal(
    resolveInitialTableDetailsExpanded({
      defaultExpanded: false,
    }),
    false,
  )
})

test('does not reapply initial expansion after the user toggles details', () => {
  assert.equal(
    shouldApplyInitialTableExpansion({
      shouldStartExpanded: true,
      userHasToggledDetails: false,
    }),
    true,
  )
  assert.equal(
    shouldApplyInitialTableExpansion({
      shouldStartExpanded: true,
      userHasToggledDetails: true,
    }),
    false,
  )
})
