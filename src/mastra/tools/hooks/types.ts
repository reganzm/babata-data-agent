export type ToolAgent = 'ximo' | 'hundun' | 'dax'

export type ToolHookContext<Input = unknown, Result = unknown> = {
  agent: ToolAgent
  tool: string
  invocationId: string
  startedAt: string
  input: Input
  result?: Result
  error?: unknown
  metadata: Record<string, unknown>
}

export type ToolHook<Input = unknown, Result = unknown> = {
  id: string
  beforeToolExecute?: (context: ToolHookContext<Input, Result>) => void | Promise<void>
  transformToolInput?: (
    context: ToolHookContext<Input, Result>,
  ) => Input | Promise<Input>
  transformToolResult?: (
    context: ToolHookContext<Input, Result> & { result: Result },
  ) => Result | Promise<Result>
  afterToolSuccess?: (
    context: ToolHookContext<Input, Result> & { result: Result },
  ) => void | Promise<void>
  afterToolError?: (
    context: ToolHookContext<Input, Result> & { error: unknown },
  ) => void | Promise<void>
  afterToolFinally?: (context: ToolHookContext<Input, Result>) => void | Promise<void>
}

export type AnyToolHook = ToolHook<any, any>

export type RunToolWithHooksParams<Input, Result> = {
  agent?: ToolAgent
  tool: string
  input: Input
  hooks?: AnyToolHook[]
  execute: (input: Input) => Promise<Result> | Result
}

