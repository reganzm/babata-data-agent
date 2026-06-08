export function resolveIntentClarificationDialogState<TPending, TPayload>(params: {
  pendingApproval?: TPending
  payloadFromPending: TPayload | null
  latchedPendingApproval?: TPending
  latchedPayload: TPayload | null
  loading: boolean
}): {
  effectivePendingApproval?: TPending
  payload: TPayload | null
} {
  if (params.pendingApproval && params.payloadFromPending) {
    return {
      effectivePendingApproval: params.pendingApproval,
      payload: params.payloadFromPending,
    }
  }

  if (params.loading) {
    return {
      effectivePendingApproval: params.latchedPendingApproval,
      payload: params.latchedPayload,
    }
  }

  return {
    effectivePendingApproval: undefined,
    payload: null,
  }
}
