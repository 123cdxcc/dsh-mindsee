import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  displayUserContent,
  interceptComposer,
  parseMindSeePrompt,
  rewriteComposerPrompt,
  sessionTitleFromUserText,
} from '../src/web/composer.ts'

const originalFetch = globalThis.fetch
const inboxPath = '/home/user/.dsh/mindsee-inbox/1786958672036-f0679e3c.png'
const otherInboxPath = '/home/user/.dsh/mindsee-inbox/1786958672037-aabbccdd.jpg'

afterEach(() => {
  globalThis.fetch = originalFetch
})

function pngFile(): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'shot.png', {
    type: 'image/png',
  })
}

/** 贴图改写成带本地路径的纯文本，让模型去调工具。 */
describe('rewriteComposerPrompt', () => {
  it('没有用户文字时只留下路径说明', () => {
    const prompt = rewriteComposerPrompt('  ', [inboxPath])
    assert.match(prompt, /<!--mindsee:v1-->/)
    assert.match(prompt, /describe_image/)
    assert.match(prompt, /1786958672036-f0679e3c\.png/)
    assert.doesNotMatch(prompt, /用户的问题/)
    assert.ok(prompt.startsWith('<!--mindsee:v1-->'))
  })

  it('把用户问题放在最前面供标题截取', () => {
    const prompt = rewriteComposerPrompt('图上写了什么', [inboxPath, otherInboxPath])
    assert.ok(prompt.startsWith('图上写了什么\n\n<!--mindsee:v1-->'))
    assert.match(prompt, /1\. \/home\/user\/\.dsh\/mindsee-inbox\/1786958672036-f0679e3c\.png/)
    assert.match(prompt, /2\. \/home\/user\/\.dsh\/mindsee-inbox\/1786958672037-aabbccdd\.jpg/)
    assert.doesNotMatch(prompt, /用户的问题/)
  })
})

/** 从注入文案还原用户问题和 inbox 路径。 */
describe('parseMindSeePrompt', () => {
  it('能往返 rewrite 的信封', () => {
    const prompt = rewriteComposerPrompt('这是什么软件', [inboxPath, otherInboxPath])
    assert.deepEqual(parseMindSeePrompt(prompt), {
      question: '这是什么软件',
      paths: [inboxPath, otherInboxPath],
    })
  })

  it('没有用户问题时 question 为空', () => {
    assert.deepEqual(parseMindSeePrompt(rewriteComposerPrompt('  ', [inboxPath])), {
      question: '',
      paths: [inboxPath],
    })
  })

  it('兼容没有 sentinel 的旧格式', () => {
    const old = `用户在对话里附上了图片。当前模型不能直接看图，请立刻用 describe_image 工具查看这些本地文件：
1. ${inboxPath}

用户的问题：
这是什么软件`
    assert.deepEqual(parseMindSeePrompt(old), {
      question: '这是什么软件',
      paths: [inboxPath],
    })
  })

  it('兼容 sentinel 在开头且带用户的问题的旧格式', () => {
    const old = `<!--mindsee:v1-->
用户在对话里附上了图片。当前模型不能直接看图，请立刻用 describe_image 工具查看这些本地文件：
1. ${inboxPath}

用户的问题：
这是什么软件`
    assert.deepEqual(parseMindSeePrompt(old), {
      question: '这是什么软件',
      paths: [inboxPath],
    })
  })

  it('普通用户消息不误伤', () => {
    assert.equal(parseMindSeePrompt('这是什么软件'), null)
    assert.equal(parseMindSeePrompt('请用 describe_image 看一下 /tmp/a.png'), null)
  })

  it('路径不在 mindsee-inbox 时不算注入文案', () => {
    const prompt = rewriteComposerPrompt('图上写了什么', ['/tmp/a.png'])
    assert.equal(parseMindSeePrompt(prompt), null)
  })
})

/** 对话气泡只展示原问题和 inbox 文件名。 */
describe('displayUserContent', () => {
  it('MindSee 注入还原为文件名和原问题', () => {
    const prompt = rewriteComposerPrompt('这是什么软件', [inboxPath])
    assert.deepEqual(displayUserContent([{ type: 'text', text: prompt }]), {
      kind: 'mindsee',
      question: '这是什么软件',
      fileNames: ['1786958672036-f0679e3c.png'],
    })
  })

  it('普通消息保留文本和原生附件', () => {
    const attachment = { attachmentId: 'a1' }
    assert.deepEqual(
      displayUserContent([
        { type: 'image', attachment },
        { type: 'text', text: '你好' },
      ]),
      {
        kind: 'plain',
        text: '你好',
        attachments: [attachment],
      },
    )
  })
})

/** 拦截 sendSession：有贴图时先落地再按文本发出。 */
describe('interceptComposer', () => {
  it('无贴图时原样转发', async () => {
    const calls: unknown[] = []
    const conversation = {
      sendSession: async (...args: unknown[]) => {
        calls.push(args)
      },
      draftImages: () => [],
      releaseDraftImages: () => {
        throw new Error('不应释放')
      },
    }
    const restore = interceptComposer(conversation)
    await conversation.sendSession({}, 'hello', [], 'queue')
    assert.deepEqual(calls, [[{}, 'hello', [], 'queue']])
    restore()
  })

  it('有贴图时先保存再以空附件重发', async () => {
    const file = pngFile()
    const attachments = [{ file }]
    const released: unknown[] = []
    const calls: unknown[] = []
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), '/mindsee/inbox')
      assert.equal(init?.method, 'POST')
      return new Response(JSON.stringify({ path: inboxPath }), { status: 200 })
    }
    const conversation = {
      sendSession: async (...args: unknown[]) => {
        calls.push(args)
      },
      draftImages: (ids: readonly string[]) => {
        assert.deepEqual([...ids], ['img-1'])
        return attachments
      },
      releaseDraftImages: (items: readonly unknown[]) => {
        released.push(items)
      },
    }
    interceptComposer(conversation)
    await conversation.sendSession({ id: 's' }, '这是什么', ['img-1'], 'queue')
    assert.equal(calls.length, 1)
    const [, text, imageIds, mode] = calls[0] as [unknown, string, string[], string]
    assert.equal(mode, 'queue')
    assert.deepEqual(imageIds, [])
    assert.ok(text.startsWith('这是什么\n\n<!--mindsee:v1-->'))
    assert.deepEqual(parseMindSeePrompt(text), { question: '这是什么', paths: [inboxPath] })
    assert.deepEqual(released, [attachments])
  })

  it('空白会话用原问题作为标题', async () => {
    const titles: string[] = []
    globalThis.fetch = async () => new Response(JSON.stringify({ path: inboxPath }), { status: 200 })
    const conversation = {
      sendSession: async () => {},
      draftImages: () => [{ file: pngFile() }],
      releaseDraftImages: () => {},
    }
    interceptComposer(conversation)
    await conversation.sendSession(
      {
        getSnapshot: () => ({ blank: true }),
        rename: async (title: string) => {
          titles.push(title)
        },
      },
      '这是什么软件',
      ['img-1'],
      'queue',
    )
    assert.deepEqual(titles, ['这是什么软件'])
  })

  it('已有内容的会话不改标题', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ path: inboxPath }), { status: 200 })
    const conversation = {
      sendSession: async () => {},
      draftImages: () => [{ file: pngFile() }],
      releaseDraftImages: () => {},
    }
    interceptComposer(conversation)
    await conversation.sendSession(
      {
        getSnapshot: () => ({ blank: false }),
        rename: async () => {
          throw new Error('不应改标题')
        },
      },
      '这是什么软件',
      ['img-1'],
      'queue',
    )
  })

  it('落地失败时不发出消息也不释放草稿', async () => {
    const released: unknown[] = []
    globalThis.fetch = async () => new Response(JSON.stringify({ message: '仅支持 JPEG、PNG 和 WebP 格式的图片' }), { status: 400 })
    const conversation = {
      sendSession: async () => {
        throw new Error('不应发出')
      },
      draftImages: () => [{ file: pngFile() }],
      releaseDraftImages: (items: readonly unknown[]) => {
        released.push(items)
      },
    }
    interceptComposer(conversation)
    await assert.rejects(() => conversation.sendSession({}, 'hi', ['img-1'], 'queue'), {
      message: '仅支持 JPEG、PNG 和 WebP 格式的图片',
    })
    assert.equal(released.length, 0)
  })
})

/** 空白会话标题取用户原问题。 */
describe('sessionTitleFromUserText', () => {
  it('有问题时用原问题', () => {
    assert.equal(sessionTitleFromUserText('  这是什么软件  '), '这是什么软件')
  })

  it('只有贴图时用短标题', () => {
    assert.equal(sessionTitleFromUserText('  '), '图片')
  })
})
