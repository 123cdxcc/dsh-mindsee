import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { describeImageFile } from '../src/client.ts'
import { DEFAULT_BASE_URL, mergeSecretConfig, resolveConfig } from '../src/config.ts'
import type { LoadedImage } from '../src/utils.ts'

const pixel: LoadedImage = {
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  mimeType: 'image/png',
  filename: 'pixel.png',
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

/** 校验插件配置：默认生产地址、本地改写与非法值。 */
describe('resolveConfig', () => {
  it('缺省使用生产地址且令牌可为空', () => {
    assert.deepEqual(resolveConfig({}), {
      baseUrl: DEFAULT_BASE_URL,
      accessToken: '',
      timeoutMs: 120_000,
    })
    assert.equal(DEFAULT_BASE_URL, 'https://openapi.mindsee.app')
  })

  it('空地址回退到生产地址', () => {
    assert.equal(resolveConfig({ baseUrl: '   ' }).baseUrl, DEFAULT_BASE_URL)
  })

  it('允许覆盖地址并去掉尾斜杠', () => {
    const resolved = resolveConfig({
      baseUrl: 'http://127.0.0.1:8087/',
      accessToken: 'mindsee_abc',
    })
    assert.equal(resolved.baseUrl, 'http://127.0.0.1:8087')
    assert.equal(resolved.accessToken, 'mindsee_abc')
  })

  it('拒绝非 http(s) 的服务地址', () => {
    assert.throws(() => resolveConfig({ baseUrl: 'ftp://example.com' }), {
      message: 'mindsee: 服务地址必须是 http(s) 绝对地址',
    })
  })
})

/** 设置页写入的凭证只覆盖令牌。 */
describe('mergeSecretConfig', () => {
  it('空令牌不覆盖插件配置', () => {
    const resolved = mergeSecretConfig({ accessToken: 'from-yml' }, '  ')
    assert.equal(resolved.accessToken, 'from-yml')
    assert.equal(resolved.baseUrl, DEFAULT_BASE_URL)
  })

  it('设置页令牌优先于插件配置', () => {
    const resolved = mergeSecretConfig({ accessToken: 'old' }, 'secret')
    assert.equal(resolved.accessToken, 'secret')
    assert.equal(resolved.baseUrl, DEFAULT_BASE_URL)
  })

  it('设置页令牌不改服务地址', () => {
    const resolved = mergeSecretConfig(
      { baseUrl: 'http://127.0.0.1:8087', accessToken: 'old' },
      'secret',
    )
    assert.equal(resolved.accessToken, 'secret')
    assert.equal(resolved.baseUrl, 'http://127.0.0.1:8087')
  })
})

/** 调用 OpenAPI 图片转述：成功解析 description，错误透传 message。 */
describe('describeImageFile', () => {
  const config = {
    baseUrl: DEFAULT_BASE_URL,
    accessToken: 'mindsee_test',
    timeoutMs: 5000,
  }

  it('合法令牌上传后返回 description', async () => {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), `${DEFAULT_BASE_URL}/v1/image/describe`)
      assert.equal(init?.method, 'POST')
      const headers = new Headers(init?.headers)
      assert.equal(headers.get('Authorization'), 'Bearer mindsee_test')
      assert.ok(init?.body instanceof FormData)
      const form = init.body
      const file = form.get('image')
      assert.ok(file instanceof Blob)
      assert.equal(form.get('question'), '图上写了什么')
      return new Response(JSON.stringify({ description: '一张图' }), { status: 200 })
    }

    const result = await describeImageFile(config, pixel, '图上写了什么')
    assert.deepEqual(result, { description: '一张图' })
  })

  it('401 时抛出响应中的 message', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: '未授权', code: 'unauthorized' }), { status: 401 })

    await assert.rejects(() => describeImageFile(config, pixel), { message: '未授权' })
  })

  it('缺文件字段的 422 透传 message', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: '请以 multipart/form-data 上传 image 文件' }), { status: 422 })

    await assert.rejects(() => describeImageFile(config, pixel), {
      message: '请以 multipart/form-data 上传 image 文件',
    })
  })
})
