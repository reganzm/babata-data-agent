'use client'

import { useEffect, useMemo, useState } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SqlCodeBlock } from '@/app/components/SqlCodeBlock'
import { fetchConversationById, toInitialMessage } from '@/lib/conversation-store'
import type { ConversationMetadata } from '@/lib/db/conversations'
import { resumeAfterSqlApproval } from '@/lib/workflow-resume-client'

type FewShotDraft = {
  originalQuestion: string
  finalIntentSummary: string
  clarificationRecord: string
  generatedSql: string
  reportMarkdown: string
  generatedAt: string
}

function readFewShotDraft(payload: unknown): FewShotDraft | null {
  if (!payload || typeof payload !== 'object') return null
  const data = payload as {
    approvalType?: string
    draft?: Partial<FewShotDraft>
  }
  if (data.approvalType !== 'few-shot-save') return null
  if (!data.draft) return null

  const {
    originalQuestion,
    finalIntentSummary,
    clarificationRecord,
    generatedSql,
    reportMarkdown,
    generatedAt,
  } = data.draft

  if (
    typeof originalQuestion !== 'string' ||
    typeof finalIntentSummary !== 'string' ||
    typeof clarificationRecord !== 'string' ||
    typeof generatedSql !== 'string' ||
    typeof reportMarkdown !== 'string' ||
    typeof generatedAt !== 'string'
  ) {
    return null
  }

  return {
    originalQuestion,
    finalIntentSummary,
    clarificationRecord,
    generatedSql,
    reportMarkdown,
    generatedAt,
  }
}

interface WorkflowFewShotApprovalDialogProps {
  conversationId: string | null
  mastraResourceId: string
  pendingApproval?: ConversationMetadata['pendingApproval']
  onResolved?: () => void
}

export function WorkflowFewShotApprovalDialog({
  conversationId,
  mastraResourceId,
  pendingApproval,
  onResolved,
}: WorkflowFewShotApprovalDialogProps) {
  const draftFromPayload = useMemo(
    () => readFewShotDraft(pendingApproval?.payload),
    [pendingApproval?.payload],
  )
  const [draft, setDraft] = useState<FewShotDraft | null>(draftFromPayload)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(draftFromPayload)
    setDialogOpen(false)
  }, [draftFromPayload, pendingApproval?.workflowRunId])

  const hasPendingFewShot = Boolean(conversationId && pendingApproval && draft)
  if (!hasPendingFewShot || !conversationId || !pendingApproval || !draft) return null

  const canSubmit =
    draft.originalQuestion.trim() &&
    draft.finalIntentSummary.trim() &&
    draft.generatedSql.trim() &&
    draft.reportMarkdown.trim() &&
    draft.generatedAt.trim()

  const handleDecision = async (approved: boolean) => {
    if (!conversationId) return
    setBusy(true)
    try {
      const conversation = await fetchConversationById(conversationId)
      const messages = (conversation?.messages ?? []).map(toInitialMessage) as UIMessage[]
      await resumeAfterSqlApproval({
        approved,
        conversationId,
        mastraResourceId,
        messages,
        context: {
          workflowId: pendingApproval.workflowId,
          workflowRunId: pendingApproval.workflowRunId ?? null,
          agentRunId: pendingApproval.agentRunId ?? null,
          sql: draft.generatedSql,
          intentSummary: draft.finalIntentSummary,
          sqlRevisionCount: undefined,
        },
        extraResumeData: approved ? { editedDraft: draft } : undefined,
        onMessagesUpdate: () => {
          /* 页面会统一刷新消息 */
        },
      })
      setDialogOpen(false)
      onResolved?.()
    } catch (error) {
      console.error('[few-shot-approval]', error)
      alert(error instanceof Error ? error.message : '审批提交失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!dialogOpen && (
        <div className="fixed right-6 bottom-24 z-[105]">
          <Button type="button" onClick={() => setDialogOpen(true)}>
            Few-shot 审核
          </Button>
        </div>
      )}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="few-shot-approval-title"
        >
          <div className="flex h-[min(90dvh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="shrink-0 border-b border-border px-4 py-2.5">
              <h3 id="few-shot-approval-title" className="text-base font-semibold">
                Few-shot 入库审批
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                可先编辑后确认，确认后会把本次分析记录写入 few-shot 知识库。
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="grid gap-3">
                <section>
                  <label className="text-xs font-medium text-foreground">
                    原始问题
                  </label>
                  <textarea
                    className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    rows={2}
                    value={draft.originalQuestion}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              originalQuestion: e.target.value,
                            }
                          : prev,
                      )
                    }
                  />
                </section>

            <section>
              <label className="text-xs font-medium text-foreground">
                最终意图分析
              </label>
              <textarea
                className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                rows={2}
                value={draft.finalIntentSummary}
                disabled={busy}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          finalIntentSummary: e.target.value,
                        }
                      : prev,
                  )
                }
              />
            </section>

            <section>
              <label className="text-xs font-medium text-foreground">
                澄清记录
              </label>
              <textarea
                className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                rows={3}
                value={draft.clarificationRecord}
                disabled={busy}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          clarificationRecord: e.target.value,
                        }
                      : prev,
                  )
                }
              />
            </section>

            <section>
              <label className="text-xs font-medium text-foreground">
                SQL（可编辑）
              </label>
              <textarea
                className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs leading-relaxed"
                rows={6}
                value={draft.generatedSql}
                disabled={busy}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          generatedSql: e.target.value,
                        }
                      : prev,
                  )
                }
              />
              <SqlCodeBlock sql={draft.generatedSql} maxHeightClassName="max-h-56" />
            </section>

            <section>
              <label className="text-xs font-medium text-foreground">
                生成时间（ISO）
              </label>
              <Input
                className="mt-1"
                value={draft.generatedAt}
                disabled={busy}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          generatedAt: e.target.value,
                        }
                      : prev,
                  )
                }
              />
            </section>

            <section>
              <label className="text-xs font-medium text-foreground">
                解读报告快照
              </label>
              <textarea
                className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs leading-relaxed"
                rows={8}
                value={draft.reportMarkdown}
                disabled={busy}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          reportMarkdown: e.target.value,
                        }
                      : prev,
                  )
                }
              />
            </section>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                稍后处理
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleDecision(false)}
              >
                不入库，直接结束
              </Button>
              <Button
                type="button"
                disabled={busy || !canSubmit}
                onClick={() => void handleDecision(true)}
              >
                {busy ? '提交中…' : '同意并写入 few-shot'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
