type LlmDebugPayload = {
  scene: string
  userInput: unknown
  llmOutput?: unknown
  extra?: Record<string, unknown>
}

export function shouldLogLlmDebug(): boolean {
  return process.env.BABATA_DEBUG_LLM === 'true' || process.env.NODE_ENV === 'development'
}

export function logLlmDebug(payload: LlmDebugPayload): void {
  if (!shouldLogLlmDebug()) return
  const ts = new Date().toISOString()
  console.info(`[llm-debug] ${payload.scene}`, {
    ts,
    userInput: payload.userInput,
    llmOutput: payload.llmOutput,
    ...payload.extra,
  })
}
