import type { LoadedImage } from './utils'

export interface OpenAPIClientConfig {
  baseUrl: string
  accessToken: string
  timeoutMs: number
}

export interface DescribeImageResponse {
  description: string
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function parseErrorMessage(body: string, status: number): string {
  try {
    const payload = JSON.parse(body) as { message?: unknown }
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message
    }
  } catch {
    // 非 JSON 错误体时回落到状态码。
  }
  return `OpenAPI 请求失败（HTTP ${status}）`
}

/** 以 multipart 调用 MindSee OpenAPI 的图片转述接口。 */
export async function describeImageFile(
  config: OpenAPIClientConfig,
  image: LoadedImage,
  question = '',
  signal?: AbortSignal,
): Promise<DescribeImageResponse> {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), image.filename)
  if (question !== '') {
    form.append('question', question)
  }

  const timeout = AbortSignal.timeout(config.timeoutMs)
  const merged = signal === undefined ? timeout : AbortSignal.any([signal, timeout])

  const response = await fetch(joinUrl(config.baseUrl, '/v1/image/describe'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
    redirect: 'error',
    signal: merged,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(parseErrorMessage(text, response.status))
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('OpenAPI 返回了无效的 JSON')
  }

  const description = (payload as { description?: unknown }).description
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error('OpenAPI 未返回图片转述结果')
  }
  return { description }
}
