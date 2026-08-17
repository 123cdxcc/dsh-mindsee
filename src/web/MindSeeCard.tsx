import { useCallback, useEffect, useState } from 'react'

import { ACCESS_TOKEN_REF } from '../config'
import { copy } from './locales'

const STYLE_ID = 'dsh-mindsee-card-css'
const css = `
.dsh-mindsee-page{display:flex;flex-direction:column;gap:12px;padding:4px 2px;max-width:520px}
.dsh-mindsee-page h2{margin:0;font-size:16px;font-weight:600;line-height:24px}
.dsh-mindsee-lead{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dsh-mindsee-field{display:flex;flex-direction:column;gap:4px}
.dsh-mindsee-field label{font-size:12px;font-weight:600}
.dsh-mindsee-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-mindsee-field input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;height:36px;border-radius:8px;padding:0 10px;outline:none}
.dsh-mindsee-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px}
.dsh-mindsee-failed{margin:0 auto 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px}
.dsh-mindsee-footer button{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;border-radius:6px;padding:6px 12px;cursor:pointer}
.dsh-mindsee-save{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
.dsh-mindsee-footer button:disabled{opacity:.45;cursor:default}
`

function ensureCss(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) {
    return
  }
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = css
  document.head.appendChild(tag)
}

interface CredentialView {
  configured?: boolean
}

interface RpcResult<T> {
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }
}

interface CredentialsApi {
  describe: (payload: { refs: string[] }) => Promise<RpcResult<{ credentials: Record<string, CredentialView> }>>
  set: (payload: { ref: string; value: string }) => Promise<RpcResult<Record<string, never>>>
}

export interface MindSeeCardProps {
  api?: { credentials: CredentialsApi }
}

/** 设置 → 插件 → MindSee 标签页。 */
export function MindSeeCard(props: MindSeeCardProps) {
  const api = props.api?.credentials
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (api === undefined) {
      return
    }
    try {
      const { result } = await api.describe({ refs: [ACCESS_TOKEN_REF] })
      if (!result.ok) {
        setLoadFailed(true)
        return
      }
      setTokenConfigured(result.value.credentials[ACCESS_TOKEN_REF]?.configured === true)
      setTokenDraft('')
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [api])

  useEffect(() => {
    ensureCss()
    void load()
  }, [load])

  const dirty = tokenDraft.trim() !== ''

  async function save() {
    if (api === undefined) {
      return
    }
    const token = tokenDraft.trim()
    if (token.length === 0) {
      return
    }
    setSaving(true)
    setFailed(false)
    try {
      const { result } = await api.set({ ref: ACCESS_TOKEN_REF, value: token })
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      await load()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dsh-mindsee-page">
      <h2>{copy('title')}</h2>
      <p className="dsh-mindsee-lead">{copy('description')}</p>
      {loadFailed ? <p className="dsh-mindsee-failed">{copy('loadFailed')}</p> : null}
      <div className="dsh-mindsee-field">
        <label htmlFor="mindsee-access-token">{copy('accessToken')}</label>
        <input
          id="mindsee-access-token"
          type="password"
          autoComplete="off"
          value={tokenDraft}
          onChange={(event) => setTokenDraft(event.target.value)}
        />
        <p className="dsh-mindsee-hint">
          {copy('accessTokenHint')} {tokenConfigured ? copy('configured') : copy('missing')}
        </p>
      </div>
      <div className="dsh-mindsee-footer">
        {failed ? (
          <p className="dsh-mindsee-failed" role="status">
            {copy('saveFailed')}
          </p>
        ) : dirty ? (
          <p className="dsh-mindsee-hint">{copy('unsaved')}</p>
        ) : null}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            setTokenDraft('')
            setFailed(false)
          }}
        >
          {copy('discard')}
        </button>
        <button type="button" className="dsh-mindsee-save" disabled={!dirty || saving} onClick={() => void save()}>
          {copy(saving ? 'saving' : 'save')}
        </button>
      </div>
    </div>
  )
}
