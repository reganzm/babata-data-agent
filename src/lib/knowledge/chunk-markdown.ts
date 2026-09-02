export type MarkdownParentChunk = {
  headingPath: string
  content: string
}

export type MarkdownChildChunk = {
  parentIndex: number
  content: string
}

const CHILD_TARGET_CHARS = 320
const CHILD_OVERLAP_CHARS = 40

function splitParentSections(markdown: string): MarkdownParentChunk[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const headingPattern = /^(#{2,3})\s+(.+)$/gm
  const matches = [...normalized.matchAll(headingPattern)]
  if (matches.length === 0) {
    return [{ headingPath: '', content: normalized }]
  }

  const parents: MarkdownParentChunk[] = []
  for (let index = 0; index < matches.length; index++) {
    const current = matches[index]
    const start = current.index ?? 0
    const end = matches[index + 1]?.index ?? normalized.length
    const headingPath = current[2]?.trim() || ''
    const content = normalized.slice(start, end).trim()
    if (content) parents.push({ headingPath, content })
  }
  return parents
}

function splitChildWindows(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return []

  const windows: string[] = []
  let buffer = ''
  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph
      continue
    }
    if (`${buffer}\n\n${paragraph}`.length <= CHILD_TARGET_CHARS) {
      buffer = `${buffer}\n\n${paragraph}`
      continue
    }
    windows.push(buffer)
    const overlap = buffer.slice(-CHILD_OVERLAP_CHARS)
    buffer = `${overlap}\n\n${paragraph}`.trim()
  }
  if (buffer) windows.push(buffer)
  return windows
}

export function chunkMarkdownDocument(markdown: string): {
  parents: MarkdownParentChunk[]
  children: MarkdownChildChunk[]
} {
  const parents = splitParentSections(markdown)
  const children: MarkdownChildChunk[] = []
  parents.forEach((parent, parentIndex) => {
    const windows = splitChildWindows(parent.content)
    for (const content of windows) {
      children.push({ parentIndex, content })
    }
  })
  return { parents, children }
}
