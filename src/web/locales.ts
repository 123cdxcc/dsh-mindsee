export const zh = {
  title: 'MindSee',
  description: '让 DeepSeek 能看懂图片。填好令牌后，可直接在输入框贴图提问。',
  accessToken: '访问令牌',
  accessTokenHint: '已配置时此处为空，填写后保存即覆盖。',
  configured: '已配置',
  missing: '未配置',
  unsaved: '未保存',
  discard: '放弃修改',
  save: '保存',
  saving: '保存中…',
  saveFailed: '保存失败',
  loadFailed: '无法读取当前配置',
  imageExpired: '图片已过期',
  copyMessage: '复制',
}

export const en = {
  title: 'MindSee',
  description: 'Let DeepSeek understand images. After saving the token, paste pictures in the composer.',
  accessToken: 'Access token',
  accessTokenHint: 'The field stays blank when set; saving a new value replaces it.',
  configured: 'Configured',
  missing: 'Not configured',
  unsaved: 'Unsaved',
  discard: 'Discard',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'Save failed',
  loadFailed: 'Could not load current settings',
  imageExpired: 'Image expired',
  copyMessage: 'Copy',
}

export type CopyKey = keyof typeof zh

/** 按页面语言取文案；没有 locale 服务时也能用。 */
export function copy(key: CopyKey): string {
  const lang = typeof document === 'undefined' ? 'zh' : document.documentElement.lang
  return (lang.startsWith('zh') ? zh : en)[key]
}
