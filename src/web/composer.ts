import { inboxFileNameFromPath, inboxPublicUrl } from '../inbox-name'

interface DraftAttachment {
  file: File
}

interface SessionLike {
  rename?: (title: string) => Promise<unknown>
  getSnapshot?: () => { blank?: boolean }
}

interface Conversation {
  sendSession(session: unknown, text: string, imageIds: readonly string[], mode: string): Promise<void>
  draftImages(ids: readonly string[]): readonly DraftAttachment[]
  releaseDraftImages(attachments: readonly DraftAttachment[]): void
}

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const MINDSEE_PROMPT_SENTINEL = '<!--mindsee:v1-->'
const HINT_HEADER = '用户在对话里附上了图片。当前模型不能直接看图，请立刻用 describe_image 工具查看这些本地文件：'
const QUESTION_HEADER = '用户的问题：'
const QUESTION_MARK = `\n\n${QUESTION_HEADER}\n`

const inboxPreviews = new Map<string, string>()

function bytesToBase64(data: Uint8Array): string {
  let binary = ''
  const chunk = 32768
  for (let offset = 0; offset < data.length; offset += chunk) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

async function stageImage(file: File): Promise<string> {
  if (file.type.length > 0 && !ACCEPTED_TYPES.has(file.type)) {
    throw new Error('仅支持 JPEG、PNG 和 WebP 格式的图片')
  }
  const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()))
  const response = await fetch('/mindsee/inbox', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  let body: { path?: string; message?: string }
  try {
    body = (await response.json()) as { path?: string; message?: string }
  } catch {
    throw new Error('无法保存贴图')
  }
  if (!response.ok || typeof body.path !== 'string' || body.path.length === 0) {
    throw new Error(body.message ?? '无法保存贴图')
  }
  return body.path
}

function rememberInboxPreview(fileName: string, file: File): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return
  }
  const previous = inboxPreviews.get(fileName)
  if (previous !== undefined) {
    URL.revokeObjectURL(previous)
  }
  inboxPreviews.set(fileName, URL.createObjectURL(file))
}

/** 本页还活着的 blob URL，否则退回同源 GET。 */
export function inboxDisplayUrl(fileName: string): string {
  return inboxPreviews.get(fileName) ?? inboxPublicUrl(fileName)
}

/** 空白会话标题用用户原问题，避免 DSH 把注入文案截成标题。 */
export function sessionTitleFromUserText(text: string): string {
  const question = text.trim()
  return question.length > 0 ? question : '图片'
}

/** 把贴图路径写进纯文本，让模型去调 describe_image。用户问题放最前，供会话标题截取。 */
export function rewriteComposerPrompt(text: string, paths: readonly string[]): string {
  const list = paths.map((path, index) => `${index + 1}. ${path}`).join('\n')
  const question = text.trim()
  const hint = `${MINDSEE_PROMPT_SENTINEL}\n${HINT_HEADER}\n${list}`
  return question.length === 0 ? hint : `${question}\n\n${hint}`
}

export interface MindSeePrompt {
  question: string
  paths: string[]
}

function collectInboxPaths(listBlock: string): string[] {
  const paths: string[] = []
  for (const line of listBlock.split('\n')) {
    const item = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (item === null) {
      continue
    }
    const path = item[1].trim()
    if (inboxFileNameFromPath(path) !== undefined) {
      paths.push(path)
    }
  }
  return paths
}

/** 从模型可见的注入文案还原用户问题和 inbox 路径；对不上则返回 null。 */
export function parseMindSeePrompt(text: string): MindSeePrompt | null {
  const raw = text.trimStart()
  const sentinelAt = raw.indexOf(MINDSEE_PROMPT_SENTINEL)
  let leading = ''
  let body = raw
  if (sentinelAt >= 0) {
    leading = raw.slice(0, sentinelAt).trim()
    body = raw.slice(sentinelAt + MINDSEE_PROMPT_SENTINEL.length).replace(/^\r?\n/, '')
  }
  if (!body.startsWith(HINT_HEADER)) {
    return null
  }
  const rest = body.slice(HINT_HEADER.length).replace(/^\r?\n/, '')
  const questionAt = rest.indexOf(QUESTION_MARK)
  const listBlock = questionAt === -1 ? rest : rest.slice(0, questionAt)
  const trailing = questionAt === -1 ? '' : rest.slice(questionAt + QUESTION_MARK.length)
  const paths = collectInboxPaths(listBlock)
  if (paths.length === 0) {
    return null
  }
  return { question: trailing.length > 0 ? trailing : leading, paths }
}

export interface ContentBlock {
  type?: string
  text?: string
  attachment?: unknown
}

export type DisplayUserContent =
  | { kind: 'mindsee'; question: string; fileNames: string[] }
  | { kind: 'plain'; text: string; attachments: unknown[] }

function textFromContent(content: readonly ContentBlock[]): string {
  const texts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text)
    }
  }
  return texts.join('')
}

function attachmentsFromContent(content: readonly ContentBlock[]): unknown[] {
  const attachments: unknown[] = []
  for (const block of content) {
    if (block.type === 'image' && block.attachment !== undefined) {
      attachments.push(block.attachment)
    }
  }
  return attachments
}

/** 对话气泡展示：MindSee 注入还原为原问题+文件名，其余原样。 */
export function displayUserContent(content: readonly ContentBlock[]): DisplayUserContent {
  const text = textFromContent(content)
  const parsed = parseMindSeePrompt(text)
  if (parsed !== null) {
    return {
      kind: 'mindsee',
      question: parsed.question,
      fileNames: parsed.paths.flatMap((path) => {
        const name = inboxFileNameFromPath(path)
        return name === undefined ? [] : [name]
      }),
    }
  }
  return { kind: 'plain', text, attachments: attachmentsFromContent(content) }
}

async function renameIfBlank(session: unknown, blank: boolean, title: string): Promise<void> {
  const face = session as SessionLike
  if (!blank || typeof face.rename !== 'function') {
    return
  }
  try {
    await face.rename(title)
  } catch {
    // 标题失败不影响这一轮对话。
  }
}

/** 发送前把输入框贴图落到 Host，避免 DSH 因模型不支持图片而拒绝。 */
export function interceptComposer(conversation: Conversation): () => void {
  const original = conversation.sendSession.bind(conversation)
  conversation.sendSession = async (session, text, imageIds, mode) => {
    if (imageIds.length === 0) {
      await original(session, text, imageIds, mode)
      return
    }
    const attachments = conversation.draftImages(imageIds)
    if (attachments.length !== imageIds.length) {
      throw new Error('conversation.sendSession: one or more draft images are no longer available')
    }
    const blank = (session as SessionLike).getSnapshot?.().blank === true
    const paths: string[] = []
    for (const attachment of attachments) {
      const path = await stageImage(attachment.file)
      paths.push(path)
      const fileName = inboxFileNameFromPath(path)
      if (fileName !== undefined) {
        rememberInboxPreview(fileName, attachment.file)
      }
    }
    await original(session, rewriteComposerPrompt(text, paths), [], mode)
    await renameIfBlank(session, blank, sessionTitleFromUserText(text))
    conversation.releaseDraftImages(attachments)
  }
  return () => {
    conversation.sendSession = original
  }
}
