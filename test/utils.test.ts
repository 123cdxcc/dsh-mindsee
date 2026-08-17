import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { loadLocalImage, sniffMimeType } from '../src/utils.ts'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
const webpBytes = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from([0x00]),
])

/** 根据 magic byte 识别 JPEG / PNG / WebP。 */
describe('sniffMimeType', () => {
  const cases: { name: string; bytes: Buffer; expected: ReturnType<typeof sniffMimeType> }[] = [
    { name: '识别 PNG', bytes: pngBytes, expected: 'image/png' },
    { name: '识别 JPEG', bytes: jpegBytes, expected: 'image/jpeg' },
    { name: '识别 WebP', bytes: webpBytes, expected: 'image/webp' },
    { name: '无法识别时返回 undefined', bytes: Buffer.from('hello'), expected: undefined },
    { name: '空内容返回 undefined', bytes: Buffer.alloc(0), expected: undefined },
  ]

  for (const tt of cases) {
    it(tt.name, () => {
      assert.equal(sniffMimeType(tt.bytes), tt.expected)
    })
  }
})

/** 读取本地图片并校验空文件、超限与不支持的格式。 */
describe('loadLocalImage', () => {
  const tempDirs: string[] = []

  after(async () => {
    // 临时目录留给 OS 回收即可，测试不主动 rm 以免权限干扰。
    tempDirs.length = 0
  })

  async function writeTemp(name: string, data: Buffer): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-mindsee-'))
    tempDirs.push(dir)
    const path = join(dir, name)
    await writeFile(path, data)
    return path
  }

  it('读取合法 PNG 并带上文件名', async () => {
    const path = await writeTemp('shot.png', pngBytes)
    const loaded = await loadLocalImage(path)
    assert.equal(loaded.mimeType, 'image/png')
    assert.equal(loaded.filename, 'shot.png')
    assert.deepEqual(loaded.bytes, pngBytes)
  })

  it('拒绝空路径', async () => {
    await assert.rejects(() => loadLocalImage('   '), { message: '请提供本地图片的绝对路径' })
  })

  it('拒绝空文件', async () => {
    const path = await writeTemp('empty.png', Buffer.alloc(0))
    await assert.rejects(() => loadLocalImage(path), { message: '图片内容为空' })
  })

  it('拒绝超过大小上限的文件', async () => {
    const path = await writeTemp('big.png', pngBytes)
    await assert.rejects(() => loadLocalImage(path, { maxBytes: 4 }), /图片大小超过/)
  })

  it('拒绝非 jpeg/png/webp 内容', async () => {
    const path = await writeTemp('note.txt', Buffer.from('not-an-image'))
    await assert.rejects(() => loadLocalImage(path), {
      message: '仅支持 JPEG、PNG 和 WebP 格式的图片',
    })
  })
})
