import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'

import { INBOX_TTL_MS, MAX_IMAGE_BYTES } from './config'
import { INBOX_DIR, INBOX_FILE_NAME, INBOX_PATH } from './inbox-name'
import { type ImageMimeType, sniffMimeType } from './utils'

const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function inboxDirectory(home: string): string {
  return join(home, INBOX_DIR)
}

/** 从请求路径取出可服务的 inbox 文件名；拒绝目录穿越和非法名字。 */
export function inboxObjectNameFromUrl(url: string): string | undefined {
  let pathname: string
  try {
    pathname = new URL(url, 'http://x').pathname
  } catch {
    return undefined
  }
  const prefix = `${INBOX_PATH}/`
  if (!pathname.startsWith(prefix)) {
    return undefined
  }
  const name = pathname.slice(prefix.length)
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return undefined
  }
  return INBOX_FILE_NAME.test(name) ? name : undefined
}

/** 读取本插件写出的 inbox 文件；名字不合法或文件不存在时返回 undefined。 */
export async function readInboxFile(
  home: string,
  name: string,
): Promise<{ bytes: Buffer; contentType: string } | undefined> {
  if (!INBOX_FILE_NAME.test(name)) {
    return undefined
  }
  const ext = name.slice(name.lastIndexOf('.') + 1)
  const contentType = CONTENT_TYPE[ext]
  if (contentType === undefined) {
    return undefined
  }
  const path = join(inboxDirectory(home), name)
  try {
    const info = await stat(path)
    if (!info.isFile()) {
      return undefined
    }
    return { bytes: await readFile(path), contentType }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function extensionFor(mime: ImageMimeType): string {
  if (mime === 'image/jpeg') {
    return 'jpg'
  }
  if (mime === 'image/webp') {
    return 'webp'
  }
  return 'png'
}

/** 把浏览器贴图落到 DSH home，返回 Host 可读取的绝对路径。 */
export async function saveInboxImage(home: string, bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0) {
    throw new Error('图片内容为空')
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`图片大小超过 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB 限制`)
  }
  const mimeType = sniffMimeType(bytes)
  if (mimeType === undefined) {
    throw new Error('仅支持 JPEG、PNG 和 WebP 格式的图片')
  }

  const dir = inboxDirectory(home)
  await mkdir(dir, { recursive: true })
  const dest = join(dir, `${Date.now()}-${randomBytes(4).toString('hex')}.${extensionFor(mimeType)}`)
  await writeFile(dest, bytes)
  return dest
}

/** 删除 inbox 里超过保留期的贴图；只动本插件写出的文件名。 */
export async function sweepInbox(home: string, now = Date.now(), ttlMs = INBOX_TTL_MS): Promise<string[]> {
  const dir = inboxDirectory(home)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }

  const removed: string[] = []
  for (const name of names) {
    if (!INBOX_FILE_NAME.test(name)) {
      continue
    }
    const path = join(dir, name)
    try {
      const info = await stat(path)
      if (!info.isFile() || now - info.mtimeMs < ttlMs) {
        continue
      }
      await unlink(path)
      removed.push(path)
    } catch {
      // 文件可能已被并发删掉。
    }
  }
  return removed
}

function resolveDshHome(ctx: Context): string {
  const homeRef = ctx.get?.('dshHomePath')
  if (typeof homeRef === 'function') {
    const home = homeRef()
    if (typeof home === 'string' && home.trim().length > 0) {
      return home
    }
  }
  if (typeof homeRef === 'string' && homeRef.trim().length > 0) {
    return homeRef
  }
  return join(homedir(), '.dsh')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        req.destroy()
        reject(new Error('请求体过大'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text.length === 0 ? {} : JSON.parse(text))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) {
    return true
  }
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

async function handleInboxPost(req: IncomingMessage, res: ServerResponse, home: string): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end()
    return
  }
  if (!sameOrigin(req)) {
    sendJson(res, 403, { message: 'untrusted origin' })
    return
  }
  try {
    const body = await readJsonBody(req, MAX_IMAGE_BYTES * 2)
    const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
    if (typeof data !== 'string' || data.length === 0) {
      sendJson(res, 400, { message: '缺少图片数据' })
      return
    }
    const bytes = Buffer.from(data, 'base64')
    const path = await saveInboxImage(home, bytes)
    sendJson(res, 200, { path })
  } catch (error) {
    sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) })
  }
}

async function handleInboxGet(req: IncomingMessage, res: ServerResponse, home: string): Promise<void> {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' })
    res.end()
    return
  }
  const name = inboxObjectNameFromUrl(req.url ?? '/')
  if (name === undefined) {
    res.writeHead(404)
    res.end()
    return
  }
  const file = await readInboxFile(home, name)
  if (file === undefined) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    'content-type': file.contentType,
    'cache-control': 'private',
    'x-content-type-options': 'nosniff',
    'content-length': file.bytes.length,
  })
  res.end(file.bytes)
}

/** 注册贴图暂存接口；仅 Web 配置有 webServer 时生效。 */
export function registerInbox(ctx: Context): void {
  ctx.inject(['webServer'], (web) => {
    const home = resolveDshHome(web)
    web.effect(() => {
      const stopPost = web.webServer.register({
        kind: 'exact',
        path: INBOX_PATH,
        handler: (req, res) => handleInboxPost(req, res, home),
      })
      const stopGet = web.webServer.register({
        kind: 'prefix',
        path: INBOX_PATH,
        handler: (req, res) => handleInboxGet(req, res, home),
      })
      return () => {
        stopPost()
        stopGet()
      }
    }, 'dsh-mindsee: inbox route')
  })
}
