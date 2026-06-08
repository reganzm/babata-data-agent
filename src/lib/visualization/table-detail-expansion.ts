export function resolveInitialTableDetailsExpanded(params: {
  defaultExpanded?: boolean
}): boolean {
  return params.defaultExpanded ?? true
}

export function shouldApplyInitialTableExpansion(params: {
  shouldStartExpanded: boolean
  userHasToggledDetails: boolean
}): boolean {
  return params.shouldStartExpanded && !params.userHasToggledDetails
}
