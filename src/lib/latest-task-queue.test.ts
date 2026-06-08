import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestTaskQueue } from './latest-task-queue'

test('latest task queue serializes work and keeps the newest pending value', async () => {
  const started: string[] = []
  const completed: string[] = []
  let releaseFirst: () => void = () => assert.fail('first task was not started')

  const queue = createLatestTaskQueue<string>(async (value) => {
    started.push(value)
    if (value === 'first') {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    }
    completed.push(value)
  })

  queue.push('first')
  queue.push('second')
  queue.push('third')

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(started, ['first'])

  releaseFirst()
  await queue.flush()

  assert.deepEqual(started, ['first', 'third'])
  assert.deepEqual(completed, ['first', 'third'])
})
