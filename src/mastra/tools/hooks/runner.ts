import type {
  RunToolWithHooksParams,
  ToolHook,
  ToolHookContext,
} from './types'

function createInvocationId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function runToolWithHooks<Input, Result>({
  agent = 'ximo',
  tool,
  input,
  hooks = [],
  execute,
}: RunToolWithHooksParams<Input, Result>): Promise<Result> {
  const typedHooks = hooks as Array<ToolHook<Input, Result>>
  const context: ToolHookContext<Input, Result> = {
    agent,
    tool,
    invocationId: createInvocationId(),
    startedAt: new Date().toISOString(),
    input,
    metadata: {},
  }

  try {
    for (const hook of typedHooks) {
      await hook.beforeToolExecute?.(context)
    }

    for (const hook of typedHooks) {
      const nextInput = await hook.transformToolInput?.(context)
      if (nextInput !== undefined) {
        context.input = nextInput
      }
    }

    let result = await execute(context.input)
    context.result = result

    for (const hook of typedHooks) {
      const nextResult = await hook.transformToolResult?.({
        ...context,
        result,
      })
      if (nextResult !== undefined) {
        result = nextResult
        context.result = nextResult
      }
    }

    for (const hook of typedHooks) {
      await hook.afterToolSuccess?.({
        ...context,
        result,
      })
    }

    return result
  } catch (error) {
    context.error = error
    for (const hook of typedHooks) {
      await hook.afterToolError?.({
        ...context,
        error,
      })
    }
    throw error
  } finally {
    for (const hook of typedHooks) {
      await hook.afterToolFinally?.(context)
    }
  }
}

export type { ToolHook, ToolHookContext } from './types'

