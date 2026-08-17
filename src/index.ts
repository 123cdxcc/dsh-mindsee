import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import {
  ACCESS_TOKEN_REF,
  type Config as PluginConfig,
  DEFAULT_BASE_URL,
  mergeSecretConfig,
} from './config'
import { registerDescribeImage } from './describe-image'
import { registerInbox } from './inbox'

export const name = 'mindsee'
export const inject = ['tools', 'credentials']

export {
  ACCESS_TOKEN_REF,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  type ResolvedConfig,
  mergeSecretConfig,
  resolveConfig,
} from './config'

/** 仅供 profile 覆盖本地地址；用户设置页不渲染这个字段。 */
const configSchema = Schema.object({
  baseUrl: Schema.string().default(DEFAULT_BASE_URL),
})

export { configSchema as Config }

async function readAccessToken(ctx: Context): Promise<string> {
  const hit = await ctx.credentials?.resolve(ACCESS_TOKEN_REF)
  return (hit?.value ?? '').trim()
}

/** 加载插件：注册 describe_image，并在有 Web 时挂上贴图暂存接口。 */
export function apply(ctx: Context, config: PluginConfig): void {
  registerDescribeImage(ctx, async () => mergeSecretConfig(config, await readAccessToken(ctx)))
  registerInbox(ctx)
}
