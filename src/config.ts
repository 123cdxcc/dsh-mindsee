/** 生产地址。 */
export const DEFAULT_BASE_URL = 'https://openapi.mindsee.app'
export const DEFAULT_TIMEOUT_MS = 120_000

/** 与 OpenAPI / 上传约定一致的图片大小上限（20MB）。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** 贴图暂存默认保留时间；当前不会自动按这个值清扫。 */
export const INBOX_TTL_MS = 24 * 60 * 60 * 1000

/** 设置页写入的访问令牌，存在 DSH credentials 里。 */
export const ACCESS_TOKEN_REF = 'MINDSEE_ACCESS_TOKEN'

export interface Config {
  baseUrl?: string
  accessToken?: string
}

export interface ResolvedConfig {
  baseUrl: string
  accessToken: string
  timeoutMs: number
}

/** 规范化插件配置；未配置或空地址回退到生产，令牌可为空（等用户在设置页填写）。 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const configured = (config.baseUrl ?? '').trim().replace(/\/+$/, '')
  const baseUrl = configured.length > 0 ? configured : DEFAULT_BASE_URL
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error('mindsee: 服务地址必须是 http(s) 绝对地址')
  }

  return {
    baseUrl,
    accessToken: (config.accessToken ?? '').trim(),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
}

/** 设置页写入的令牌覆盖插件 Config；空字符串不覆盖。 */
export function mergeSecretConfig(config: Config, accessToken = ''): ResolvedConfig {
  const token = accessToken.trim()
  return resolveConfig({
    ...config,
    accessToken: token.length > 0 ? token : config.accessToken,
  })
}
