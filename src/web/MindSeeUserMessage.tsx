import { useEffect, useState } from 'react'

import { type ContentBlock, displayUserContent, inboxDisplayUrl } from './composer'
import { copy } from './locales'

const STYLE_ID = 'dsh-mindsee-user-css'
const css = `
.dsh-mindsee-user{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.dsh-mindsee-user-stack{display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%)}
.dsh-mindsee-user-images{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}
.dsh-mindsee-user-images img{max-height:160px;max-width:220px;border-radius:12px;object-fit:cover}
.dsh-mindsee-user-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-mindsee-user-expired{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:8px 0}
.dsh-mindsee-user-copy{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;padding:0 4px;cursor:pointer}
.dsh-mindsee-user-copy:hover{color:var(--dsw-alias-label-primary)}
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

function InboxImage({ fileName }: { fileName: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="dsh-mindsee-user-expired">{copy('imageExpired')}</span>
  }
  return <img src={inboxDisplayUrl(fileName)} alt="" onError={() => setFailed(true)} />
}

function NativeImage({
  attachment,
  loadImage,
}: {
  attachment: unknown
  loadImage?: (attachment: unknown) => Promise<string>
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loadImage === undefined) {
      setFailed(true)
      return
    }
    let cancelled = false
    void loadImage(attachment)
      .then((next) => {
        if (!cancelled) {
          setUrl(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [attachment, loadImage])
  if (failed) {
    return <span className="dsh-mindsee-user-expired">{copy('imageExpired')}</span>
  }
  if (url === null) {
    return null
  }
  return <img src={url} alt="" />
}

export interface MindSeeUserMessageProps {
  node: { data: { content: readonly ContentBlock[] } }
  loadImage?: (attachment: unknown) => Promise<string>
}

/** 遮蔽 DSH 默认 user/steering 气泡：MindSee 注入只显示原图和原问题。 */
export function MindSeeUserMessage(props: MindSeeUserMessageProps) {
  const displayed = displayUserContent(props.node.data.content ?? [])
  const images =
    displayed.kind === 'mindsee'
      ? displayed.fileNames.map((fileName) => <InboxImage key={fileName} fileName={fileName} />)
      : displayed.attachments.map((attachment, index) => (
          <NativeImage key={index} attachment={attachment} loadImage={props.loadImage} />
        ))
  const text = displayed.kind === 'mindsee' ? displayed.question : displayed.text

  useEffect(() => {
    ensureCss()
  }, [])

  return (
    <div className="dsh-mindsee-user">
      <div className="dsh-mindsee-user-stack">
        {images.length > 0 ? <div className="dsh-mindsee-user-images">{images}</div> : null}
        {text.length > 0 ? <div className="dsh-mindsee-user-bubble">{text}</div> : null}
      </div>
      {text.length > 0 ? (
        <button
          type="button"
          className="dsh-mindsee-user-copy"
          onClick={() => {
            void navigator.clipboard.writeText(text)
          }}
        >
          {copy('copyMessage')}
        </button>
      ) : null}
    </div>
  )
}
