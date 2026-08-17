import type { Context } from '@deepseek-ai/cordis'

import { describeImageFile, type OpenAPIClientConfig } from './client'
import { loadLocalImage } from './utils'

interface DescribeImageArgs {
  image: string
  question?: string
}

interface DescribeImageResult {
  description: string
}

const description = `把本地图片内容转述成文字，供无法直接读取图片的模型使用。

用户在输入框贴图时，消息里会出现本地文件路径；看到这些路径时请立刻调用本工具。
也可以用于用户直接给出的本地绝对路径、读取截图文字或报错、理解图表和界面。
仅支持 JPEG、PNG 或 WebP。已知想了解什么时请填写 question。`

/** 注册 describe_image 工具；实际转述由 MindSee OpenAPI 完成。 */
export function registerDescribeImage(
  ctx: Context,
  getConfig: () => Promise<OpenAPIClientConfig>,
): void {
  ctx.tools.register({
    name: 'describe_image',
    description,
    parameters: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: '本地图片的绝对路径，支持 JPEG、PNG、WebP',
        },
        question: {
          type: 'string',
          description: '针对这张图片想了解的具体问题；留空则返回图片的完整转述',
        },
      },
      required: ['image'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
        },
        required: ['description'],
      },
      render: (_args: DescribeImageArgs, value: DescribeImageResult) => [{ type: 'text', text: value.description }],
    },
    presentCall: (args: DescribeImageArgs) => ({
      card: 'generic' as const,
      title: '转述图片',
      kind: 'read',
      rawInput: args,
      locations: [{ path: args.image }],
    }),
    async execute(args: DescribeImageArgs, exec: { signal: AbortSignal }) {
      const config = await getConfig()
      if (config.accessToken.length === 0) {
        throw new Error('请在设置 → 插件 → MindSee 中填写访问令牌')
      }
      const image = await loadLocalImage(args.image, { signal: exec.signal })
      return describeImageFile(config, image, args.question ?? '', exec.signal)
    },
  })
}
