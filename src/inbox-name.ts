export const INBOX_DIR = 'mindsee-inbox'
export const INBOX_PATH = '/mindsee/inbox'
export const INBOX_FILE_NAME = /^\d+-[0-9a-f]+\.(jpg|png|webp)$/

/** 从本地绝对路径取出可公开的 inbox 文件名；路径必须落在 mindsee-inbox。 */
export function inboxFileNameFromPath(path: string): string | undefined {
  const parts = path.trim().split(/[/\\]/).filter((part) => part.length > 0)
  if (parts.length < 2 || parts[parts.length - 2] !== INBOX_DIR) {
    return undefined
  }
  const name = parts[parts.length - 1]
  return INBOX_FILE_NAME.test(name) ? name : undefined
}

/** 对话气泡里用来拉缩略图的同源 URL。 */
export function inboxPublicUrl(fileName: string): string {
  return `${INBOX_PATH}/${fileName}`
}
