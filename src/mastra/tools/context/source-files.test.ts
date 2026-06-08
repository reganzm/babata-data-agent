import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  globWarehouseSourcesOperation,
  globWarehouseSourcesTool,
  readWarehouseSourceOperation,
  searchWarehouseSourcesOperation,
} from './source-files'

function withSourceRoot<T>(run: (root: string) => Promise<T> | T): Promise<T> | T {
  const previousRoots = process.env.HUNDUN_SOURCE_ROOTS
  const previousExtensions = process.env.HUNDUN_SOURCE_EXTENSIONS
  const previousSearchLimit = process.env.HUNDUN_SOURCE_SEARCH_LIMIT
  const previousReadMaxChars = process.env.HUNDUN_SOURCE_READ_MAX_CHARS
  const previousSearchBackend = process.env.HUNDUN_SOURCE_SEARCH_BACKEND
  const previousRipgrepPath = process.env.RIPGREP_PATH
  const previousRipgrepArgsPrefix = process.env.RIPGREP_ARGS_PREFIX_JSON
  const root = mkdtempSync(join(tmpdir(), 'hundun-source-'))
  process.env.HUNDUN_SOURCE_ROOTS = root
  process.env.HUNDUN_SOURCE_EXTENSIONS = '.sql,.md'
  process.env.HUNDUN_SOURCE_SEARCH_LIMIT = '5'
  process.env.HUNDUN_SOURCE_READ_MAX_CHARS = '80'
  process.env.HUNDUN_SOURCE_SEARCH_BACKEND = 'typescript'

  const restore = () => {
    if (previousRoots === undefined) delete process.env.HUNDUN_SOURCE_ROOTS
    else process.env.HUNDUN_SOURCE_ROOTS = previousRoots
    if (previousExtensions === undefined) delete process.env.HUNDUN_SOURCE_EXTENSIONS
    else process.env.HUNDUN_SOURCE_EXTENSIONS = previousExtensions
    if (previousSearchLimit === undefined) delete process.env.HUNDUN_SOURCE_SEARCH_LIMIT
    else process.env.HUNDUN_SOURCE_SEARCH_LIMIT = previousSearchLimit
    if (previousReadMaxChars === undefined) delete process.env.HUNDUN_SOURCE_READ_MAX_CHARS
    else process.env.HUNDUN_SOURCE_READ_MAX_CHARS = previousReadMaxChars
    if (previousSearchBackend === undefined) delete process.env.HUNDUN_SOURCE_SEARCH_BACKEND
    else process.env.HUNDUN_SOURCE_SEARCH_BACKEND = previousSearchBackend
    if (previousRipgrepPath === undefined) delete process.env.RIPGREP_PATH
    else process.env.RIPGREP_PATH = previousRipgrepPath
    if (previousRipgrepArgsPrefix === undefined) delete process.env.RIPGREP_ARGS_PREFIX_JSON
    else process.env.RIPGREP_ARGS_PREFIX_JSON = previousRipgrepArgsPrefix
    rmSync(root, { recursive: true, force: true })
  }

  try {
    const result = run(root)
    if (result instanceof Promise) {
      return result.finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

function writeFakeRipgrep(root: string): string {
  const scriptPath = join(root, 'fake-rg.js')
  writeFileSync(
    scriptPath,
    `
const fs = require('node:fs')
const args = process.argv.slice(2)
if (args.includes('--version')) {
  console.log('ripgrep 99.0.0')
  process.exit(0)
}
if (process.env.FAKE_RG_FAIL === '1') {
  process.exit(2)
}
const maxFilesizeIndex = args.indexOf('--max-filesize')
const pattern = args[maxFilesizeIndex + 2]
const files = args.slice(maxFilesizeIndex + 3)
const regex = new RegExp(pattern)
let found = false
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\\r?\\n/)
  for (const [index, line] of lines.entries()) {
    if (!regex.test(line)) continue
    found = true
    console.log(JSON.stringify({
      type: 'match',
      data: {
        path: { text: file },
        lines: { text: line + '\\n' },
        line_number: index + 1,
      },
    }))
  }
}
process.exit(found ? 0 : 1)
`.trimStart(),
  )
  return scriptPath
}

test('glob warehouse sources returns only allowlisted source files', async () => {
  await withSourceRoot(async (root) => {
    mkdirSync(join(root, 'jobs'))
    writeFileSync(join(root, 'jobs', 'daily.sql'), 'SELECT * FROM fact_order')
    writeFileSync(join(root, 'jobs', 'notes.md'), '# 指标口径')
    writeFileSync(join(root, 'jobs', '.env'), 'SECRET=1')

    const result = await globWarehouseSourcesOperation({})

    assert.equal(result.configured, true)
    assert.deepEqual(
      result.files.map((file) => file.path).sort(),
      ['jobs/daily.sql', 'jobs/notes.md'],
    )
  })
})

test('glob warehouse sources supports target directory and glob pattern', async () => {
  await withSourceRoot(async (root) => {
    mkdirSync(join(root, 'jobs'))
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'jobs', 'daily.sql'), 'SELECT * FROM fact_order')
    writeFileSync(join(root, 'jobs', 'weekly.sql'), 'SELECT * FROM fact_weekly')
    writeFileSync(join(root, 'docs', 'metric.md'), '# 指标口径')

    const result = await globWarehouseSourcesOperation({
      glob_pattern: '*.sql',
      target_directory: 'jobs',
    })

    assert.equal(result.ok, true)
    assert.equal(result.pattern, '*.sql')
    assert.equal(result.target_directory, 'jobs')
    assert.equal(result.count, 2)
    assert.deepEqual(result.paths, ['jobs/daily.sql', 'jobs/weekly.sql'])
  })
})

test('glob warehouse sources applies limit after pattern matching for deep files', async () => {
  await withSourceRoot(async (root) => {
    for (let index = 0; index < 6; index += 1) {
      writeFileSync(join(root, `a${index}.sql`), 'SELECT 1')
    }
    mkdirSync(join(root, 'z', 'very', 'deep'), { recursive: true })
    writeFileSync(
      join(root, 'z', 'very', 'deep', 'ads_doris_peanut_voice_room_daily_stat_1d.sql'),
      'SELECT * FROM ads_doris_peanut_voice_room_daily_stat_1d',
    )

    const result = await globWarehouseSourcesOperation({
      glob_pattern: '**/ads_doris_peanut_voice_room_daily_stat_1d.sql',
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.paths, [
      'z/very/deep/ads_doris_peanut_voice_room_daily_stat_1d.sql',
    ])
  })
})

test('search warehouse sources returns capped contextual matches', async () => {
  await withSourceRoot(async (root) => {
    writeFileSync(
      join(root, 'metric.sql'),
      [
        'SELECT room_id,',
        '       SUM(diamond_amount) AS diamond_flow',
        'FROM ads_voice_room',
        'GROUP BY room_id',
      ].join('\n'),
    )

    const result = await searchWarehouseSourcesOperation({
      query: 'diamond_flow',
    })

    assert.equal(result.configured, true)
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0]?.path, 'metric.sql')
    assert.equal(result.matches[0]?.line, 2)
    assert.match(result.matches[0]?.text ?? '', /diamond_flow/)
  })
})

test('search warehouse sources supports regex pattern path and file glob', async () => {
  await withSourceRoot(async (root) => {
    mkdirSync(join(root, 'jobs'))
    writeFileSync(join(root, 'jobs', 'metric.sql'), 'SELECT diamond_flow FROM ads_voice_room')
    writeFileSync(join(root, 'jobs', 'metric.md'), 'diamond_flow 文档说明')

    const result = await searchWarehouseSourcesOperation({
      pattern: 'diamond_\\w+',
      path: 'jobs',
      glob: '*.sql',
    })

    assert.equal(result.ok, true)
    assert.equal(result.backend, 'typescript_fallback')
    assert.equal(result.count, 1)
    assert.equal(result.matches[0]?.path, 'jobs/metric.sql')
    assert.equal(result.matches[0]?.line_number, 1)
    assert.match(result.matches[0]?.text ?? '', /diamond_flow/)
  })
})

test('search warehouse sources prefers ripgrep and preserves extension allowlist', async () => {
  await withSourceRoot(async (root) => {
    process.env.HUNDUN_SOURCE_SEARCH_BACKEND = 'auto'
    process.env.RIPGREP_PATH = process.execPath
    process.env.RIPGREP_ARGS_PREFIX_JSON = JSON.stringify([writeFakeRipgrep(root)])
    writeFileSync(join(root, 'metric.sql'), 'SELECT diamond_flow FROM ads_voice_room')
    writeFileSync(join(root, 'secret.pem'), 'diamond_flow should not be searched')

    const result = await searchWarehouseSourcesOperation({
      pattern: 'diamond_flow',
    })

    assert.equal(result.backend, 'ripgrep')
    assert.equal(result.fallback_reason, null)
    assert.deepEqual(
      result.matches.map((match) => match.path),
      ['metric.sql'],
    )
  })
})

test('search warehouse sources falls back to typescript when ripgrep fails', async () => {
  const previousFail = process.env.FAKE_RG_FAIL
  try {
    await withSourceRoot(async (root) => {
      process.env.HUNDUN_SOURCE_SEARCH_BACKEND = 'auto'
      process.env.RIPGREP_PATH = process.execPath
      process.env.RIPGREP_ARGS_PREFIX_JSON = JSON.stringify([writeFakeRipgrep(root)])
      process.env.FAKE_RG_FAIL = '1'
      writeFileSync(join(root, 'metric.sql'), 'SELECT diamond_flow FROM ads_voice_room')

      const result = await searchWarehouseSourcesOperation({
        pattern: 'diamond_flow',
      })

      assert.equal(result.backend, 'typescript_fallback')
      assert.equal(result.fallback_reason, 'ripgrep_execution_failed')
      assert.equal(result.matches[0]?.path, 'metric.sql')
    })
  } finally {
    if (previousFail === undefined) delete process.env.FAKE_RG_FAIL
    else process.env.FAKE_RG_FAIL = previousFail
  }
})

test('search warehouse sources supports direct file path', async () => {
  await withSourceRoot(async (root) => {
    writeFileSync(join(root, 'metric.sql'), 'SELECT diamond_flow FROM ads_voice_room')
    writeFileSync(join(root, 'other.sql'), 'SELECT revenue FROM ads_voice_room')

    const result = await searchWarehouseSourcesOperation({
      pattern: 'diamond_flow',
      path: 'metric.sql',
    })

    assert.equal(result.count, 1)
    assert.equal(result.matches[0]?.path, 'metric.sql')
  })
})

test('search warehouse sources does not exceed configured limit with per-call limit', async () => {
  await withSourceRoot(async (root) => {
    process.env.HUNDUN_SOURCE_SEARCH_LIMIT = '1'
    writeFileSync(join(root, 'a.sql'), 'SELECT diamond_flow FROM a')
    writeFileSync(join(root, 'b.sql'), 'SELECT diamond_flow FROM b')

    const result = await searchWarehouseSourcesOperation({
      query: 'diamond_flow',
      limit: 5,
    })

    assert.equal(result.matches.length, 1)
    assert.equal(result.truncated, true)
  })
})

test('read warehouse source blocks traversal and truncates content', async () => {
  await withSourceRoot(async (root) => {
    const sourcePath = join(root, 'long.sql')
    writeFileSync(sourcePath, `SELECT '${'x'.repeat(200)}'`)

    const result = await readWarehouseSourceOperation({
      path: 'long.sql',
    })

    assert.equal(result.configured, true)
    assert.equal(result.path, 'long.sql')
    assert.equal(result.truncated, true)
    assert.equal(result.content.length, 80)

    await assert.rejects(
      () =>
        readWarehouseSourceOperation({
          path: resolve(root, '..', 'outside.sql'),
        }),
      /不在混沌源码白名单目录内/,
    )
  })
})

test('read warehouse source rejects absolute paths outside configured roots', async () => {
  const externalRoot = mkdtempSync(join(tmpdir(), 'hundun-external-'))
  try {
    await withSourceRoot(async () => {
      const externalPath = join(externalRoot, 'external.sql')
      writeFileSync(externalPath, 'SELECT diamond_flow FROM external_table')

      await assert.rejects(
        () =>
          readWarehouseSourceOperation({
            path: resolve(externalPath),
          }),
        /文件不在混沌源码白名单目录内/,
      )
    })
  } finally {
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test('read warehouse source supports offset and limit by line', async () => {
  await withSourceRoot(async (root) => {
    writeFileSync(join(root, 'multi.sql'), ['line1', 'line2', 'line3'].join('\n'))

    const result = await readWarehouseSourceOperation({
      path: 'multi.sql',
      offset: 2,
      limit: 1,
    })

    assert.equal(result.ok, true)
    assert.equal(result.content, 'line2')
    assert.equal(result.line_count, 1)
    assert.equal(result.total_line_count, 3)
    assert.equal(result.truncated, true)
  })
})

test('read warehouse source rejects symlinks that resolve outside roots', async (t) => {
  await withSourceRoot(async (root) => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'hundun-outside-'))
    const outsideFile = join(outsideDir, 'outside.sql')
    writeFileSync(outsideFile, 'SELECT secret_value FROM outside_table')

    try {
      symlinkSync(outsideFile, join(root, 'linked.sql'), 'file')
    } catch {
      rmSync(outsideDir, { recursive: true, force: true })
      t.skip('当前系统不允许创建 symlink')
      return
    }

    try {
      await assert.rejects(
        () =>
          readWarehouseSourceOperation({
            path: 'linked.sql',
          }),
        /不在混沌源码白名单目录内/,
      )
    } finally {
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })
})

test('source operations report unavailable when roots are not configured', async () => {
  const previousRoots = process.env.HUNDUN_SOURCE_ROOTS
  delete process.env.HUNDUN_SOURCE_ROOTS

  try {
    const result = await globWarehouseSourcesOperation({})
    assert.equal(result.configured, false)
    assert.deepEqual(result.files, [])
  } finally {
    if (previousRoots === undefined) delete process.env.HUNDUN_SOURCE_ROOTS
    else process.env.HUNDUN_SOURCE_ROOTS = previousRoots
  }
})

test('unconfigured source operations audit as hundun tools', async () => {
  const previousRoots = process.env.HUNDUN_SOURCE_ROOTS
  const previousAudit = process.env.BABATA_AUDIT_LOG
  const previousAuditFile = process.env.BABATA_AUDIT_LOG_FILE
  const originalInfo = console.info
  const lines: string[] = []
  const auditDir = mkdtempSync(join(tmpdir(), 'hundun-audit-'))
  delete process.env.HUNDUN_SOURCE_ROOTS
  process.env.BABATA_AUDIT_LOG = 'true'
  process.env.BABATA_AUDIT_LOG_FILE = join(auditDir, 'audit.log')
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }

  try {
    await globWarehouseSourcesTool.execute?.({}, {} as never)
    const payloads = lines.map(
      (line) =>
        JSON.parse(line) as {
          event?: string
          agent?: string
        },
    )

    assert.ok(
      payloads.some(
        (payload) =>
          payload.event === 'hundun-tool.glob-warehouse-sources.result' &&
          payload.agent === 'hundun',
      ),
    )
  } finally {
    console.info = originalInfo
    if (previousRoots === undefined) delete process.env.HUNDUN_SOURCE_ROOTS
    else process.env.HUNDUN_SOURCE_ROOTS = previousRoots
    if (previousAudit === undefined) delete process.env.BABATA_AUDIT_LOG
    else process.env.BABATA_AUDIT_LOG = previousAudit
    if (previousAuditFile === undefined) delete process.env.BABATA_AUDIT_LOG_FILE
    else process.env.BABATA_AUDIT_LOG_FILE = previousAuditFile
    rmSync(auditDir, { recursive: true, force: true })
  }
})
