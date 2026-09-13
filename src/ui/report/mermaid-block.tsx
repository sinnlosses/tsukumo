// レポートの ```mermaid フェンスの中身を図として描く。**mermaid は `vendor/` に同梱し、
// その記法が実際に出てきたときだけ `<script>` で読み込む**（`docs/requirements.md` 4.2）。
//
// もとは `src/presentation/browser/report-renderers.ts` の `drawDiagrams` だった処理を、
// 部品の `useEffect` に持ち替えた（移行の段6。docs/design.md 6.4）。

import { useEffect, useRef, useState, type ReactElement } from "react"

import { vendorAssetPath } from "../../protocol/vendor-asset.ts"
import { loadVendorScript } from "./vendor-script.ts"

const MERMAID_SRC = vendorAssetPath("mermaid.min.js")

export type MermaidBlockProps = {
  readonly code: string
}

export function MermaidBlock(props: MermaidBlockProps): ReactElement {
  const nodeRef = useRef<HTMLPreElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    loadVendorScript(MERMAID_SRC)
      .then(() => {
        const node = nodeRef.current
        if (cancelled || node === null) {
          return
        }
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" })
        return mermaid.run({ nodes: [node] })
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <pre ref={nodeRef} className="mermaid" data-mermaid-failed={failed ? "yes" : undefined}>
      {props.code}
    </pre>
  )
}
