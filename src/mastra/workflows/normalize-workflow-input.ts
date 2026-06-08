import { z } from 'zod'

export const workflowUserQueryObjectSchema = z.object({
  userQuery: z.string().min(1, 'userQuery 不能为空'),
})

/**
 * Workflow 工具入参：LLM 常把整段需求写成 inputData 字符串而非 { userQuery }。
 * 使用 union（而非仅 preprocess）以便 JSON Schema 允许 string，通过工具层校验。
 */
export const workflowUserQueryInputSchema = z.union([
  z
    .string()
    .min(1, 'userQuery 不能为空')
    .transform((s) => ({ userQuery: s.trim() })),
  workflowUserQueryObjectSchema,
])
