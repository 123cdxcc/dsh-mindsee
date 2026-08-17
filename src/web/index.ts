import { interceptComposer } from './composer'
import { MindSeeCard, type MindSeeCardProps } from './MindSeeCard'
import { MindSeeUserMessage } from './MindSeeUserMessage'

export const name = 'dsh-mindsee'
/** Cordis 服务名。写成包名会让 client fiber 一直 pending。 */
export const inject = ['slots', 'conversation']

interface Conversation {
  sendSession(session: unknown, text: string, imageIds: readonly string[], mode: string): Promise<void>
  draftImages(ids: readonly string[]): readonly { file: File }[]
  releaseDraftImages(attachments: readonly { file: File }[]): void
}

interface ClientContext {
  conversation: Conversation
  get(name: string): { api: MindSeeCardProps['api'] } | undefined
  slots: {
    inject(name: string, factory: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  effect(callback: () => (() => void) | void, label?: string): void
}

function registerChatNode(ctx: ClientContext, key: 'user' | 'steering'): () => void {
  return ctx.slots.register(
    {
      name: 'conversation.chat.node',
      key,
      priority: -1,
    },
    MindSeeUserMessage,
  )
}

/** 挂 MindSee 设置页，接管输入框贴图，并还原对话气泡展示。 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => interceptComposer(ctx.conversation), 'dsh-mindsee: composer intercept')
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'mindsee',
        order: 25,
        label: 'MindSee',
        inject: (): MindSeeCardProps => ({
          api: ctx.get('connection')?.api,
        }),
      },
      MindSeeCard,
    ),
  )
  ctx.slots.inject('conversation.chat.node', () => {
    const stopUser = registerChatNode(ctx, 'user')
    const stopSteering = registerChatNode(ctx, 'steering')
    return () => {
      stopUser()
      stopSteering()
    }
  })
}
