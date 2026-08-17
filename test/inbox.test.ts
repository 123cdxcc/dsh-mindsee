import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { inboxDirectory, inboxObjectNameFromUrl, readInboxFile, saveInboxImage, sweepInbox } from '../src/inbox.ts'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

async function inboxHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mindsee-inbox-'))
}

/** 把贴图字节落到 inbox 目录并校验路径。 */
describe('saveInboxImage', () => {
  it('保存 PNG 并返回绝对路径', async () => {
    const home = await inboxHome()
    const path = await saveInboxImage(home, pngBytes)
    assert.match(path, /mindsee-inbox\/.+\.png$/)
    assert.deepEqual(await readFile(path), pngBytes)
  })

  it('拒绝无法识别的内容', async () => {
    const home = await inboxHome()
    await assert.rejects(() => saveInboxImage(home, Buffer.from('not-an-image')), {
      message: '仅支持 JPEG、PNG 和 WebP 格式的图片',
    })
  })
})

/** 只删除本插件写出且超过保留期的贴图。 */
describe('sweepInbox', () => {
  it('删除过期文件，保留未过期和无关文件', async () => {
    const home = await inboxHome()
    const dir = inboxDirectory(home)
    const stale = await saveInboxImage(home, pngBytes)
    const fresh = await saveInboxImage(home, pngBytes)
    const other = join(dir, 'keep-me.png')
    await writeFile(other, pngBytes)
    await utimes(stale, 0, 0)

    const removed = await sweepInbox(home, Date.now(), 60_000)
    assert.deepEqual(removed, [stale])
    await assert.rejects(() => readFile(stale), { code: 'ENOENT' })
    assert.deepEqual(await readFile(fresh), pngBytes)
    assert.deepEqual(await readFile(other), pngBytes)
  })

  it('目录不存在时当作没有文件', async () => {
    const home = await inboxHome()
    assert.deepEqual(await sweepInbox(home), [])
  })
})

/** GET 只按合法 basename 读本插件写出的文件。 */
describe('inboxObjectNameFromUrl', () => {
  it('接受合法文件名', () => {
    assert.equal(inboxObjectNameFromUrl('/mindsee/inbox/1786958672036-f0679e3c.png'), '1786958672036-f0679e3c.png')
  })

  it('拒绝目录穿越和非法名字', () => {
    assert.equal(inboxObjectNameFromUrl('/mindsee/inbox/../etc/passwd'), undefined)
    assert.equal(inboxObjectNameFromUrl('/mindsee/inbox/%2e%2e/passwd'), undefined)
    assert.equal(inboxObjectNameFromUrl('/mindsee/inbox/foo/1786958672036-f0679e3c.png'), undefined)
    assert.equal(inboxObjectNameFromUrl('/mindsee/inbox/a.png'), undefined)
    assert.equal(inboxObjectNameFromUrl('/mindsee/inbox/'), undefined)
  })
})

/** 按文件名读取 inbox；缺文件当不存在。 */
describe('readInboxFile', () => {
  it('读出刚保存的 PNG', async () => {
    const home = await inboxHome()
    const path = await saveInboxImage(home, pngBytes)
    const name = path.split(/[/\\]/).pop() ?? ''
    const file = await readInboxFile(home, name)
    assert.equal(file?.contentType, 'image/png')
    assert.deepEqual(file?.bytes, pngBytes)
  })

  it('缺文件返回 undefined', async () => {
    const home = await inboxHome()
    assert.equal(await readInboxFile(home, '1786958672036-f0679e3c.png'), undefined)
  })

  it('非法文件名即使磁盘上有也不读', async () => {
    const home = await inboxHome()
    const dir = inboxDirectory(home)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'keep-me.png'), pngBytes)
    assert.equal(await readInboxFile(home, 'keep-me.png'), undefined)
  })
})
