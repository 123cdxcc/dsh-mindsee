import { basename } from 'node:path'
import { readFile, stat } from 'node:fs/promises'

import { MAX_IMAGE_BYTES } from './config'

export { MAX_IMAGE_BYTES }

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface LoadedImage {
  bytes: Buffer
  mimeType: ImageMimeType
  filename: string
}

/** 根据 magic byte 识别 JPEG / PNG / WebP；无法识别时返回 undefined。 */
export function sniffMimeType(bytes: Uint8Array): ImageMimeType | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  ) {
    return 'image/webp'
  }
  return undefined
}

/** 读取本地图片文件并校验存在性、大小与格式。 */
export async function loadLocalImage(
  path: string,
  options: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<LoadedImage> {
  const trimmed = path.trim()
  if (trimmed.length === 0) {
    throw new Error('请提供本地图片的绝对路径')
  }

  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES
  const info = await stat(trimmed)
  if (!info.isFile()) {
    throw new Error(`路径不是文件: ${trimmed}`)
  }
  if (info.size > maxBytes) {
    throw new Error(`图片大小超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`)
  }

  const bytes = await readFile(trimmed, { signal: options.signal })
  if (bytes.length === 0) {
    throw new Error('图片内容为空')
  }
  const mimeType = sniffMimeType(bytes)
  if (mimeType === undefined) {
    throw new Error('仅支持 JPEG、PNG 和 WebP 格式的图片')
  }
  return { bytes, mimeType, filename: basename(trimmed) }
}
