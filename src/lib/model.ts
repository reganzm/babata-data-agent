/**
 * 多模型提供商配置
 *
 * 通过环境变量在 OpenAI / Anthropic 之间切换，支持 MODEL_BASE_URL 对接兼容 API。
 * P4：MODEL_BABATA / MODEL_XIMO / MODEL_CHESTNUT / MODEL_HUNDUN 可按 Agent 覆盖 MODEL_NAME。
 */

import { createProviderRegistry } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

const baseURL = process.env.MODEL_BASE_URL?.trim() || undefined

const openai = createOpenAI({ ...(baseURL ? { baseURL } : {}) })
const anthropic = createAnthropic({ ...(baseURL ? { baseURL } : {}) })

export const registry = createProviderRegistry({
  openai,
  anthropic,
})

export type AgentModelRole = 'babata' | 'ximo' | 'chestnut' | 'hundun'

const ROLE_MODEL_ENV: Record<AgentModelRole, string | undefined> = {
  babata: process.env.MODEL_BABATA,
  ximo: process.env.MODEL_XIMO,
  chestnut: process.env.MODEL_CHESTNUT,
  hundun: process.env.MODEL_HUNDUN,
}

export function getModelIdForRole(role: AgentModelRole = 'babata'): string {
  const provider = process.env.MODEL_PROVIDER || 'openai'
  const model =
    ROLE_MODEL_ENV[role]?.trim() || process.env.MODEL_NAME || 'gpt-4o'
  if (model.includes(':')) return model
  return `${provider}:${model}`
}

export function getModelId(): string {
  return getModelIdForRole('babata')
}

export function getModelForRole(role: AgentModelRole = 'babata') {
  const provider = process.env.MODEL_PROVIDER || 'openai'
  const modelName =
    ROLE_MODEL_ENV[role]?.trim() || process.env.MODEL_NAME || 'gpt-4o'
  const bareName = modelName.includes(':')
    ? modelName.split(':').slice(1).join(':')
    : modelName

  if (provider === 'openai' && baseURL) {
    return openai.chat(bareName)
  }

  const id = getModelIdForRole(role) as Parameters<
    typeof registry.languageModel
  >[0]
  return registry.languageModel(id)
}

/** @deprecated 使用 getModelForRole('babata') */
export function getModel() {
  return getModelForRole('babata')
}
