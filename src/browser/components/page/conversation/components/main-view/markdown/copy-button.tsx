// フェンス付きコードブロックの中身をクリップボードへ写すボタン（`Pre` が使う）。
// 写ったことは、短い間だけ文字を「コピーした」に変えて示す。

import { Check, Copy } from "lucide-react"
import { useState, type ReactElement } from "react"

import styles from "./report-notation.module.css"

/** 「コピーした」の文字を保つ長さ（ミリ秒）。 */
const COPIED_LABEL_DURATION_MS = 1500

export function CopyButton(props: { readonly text: string }): ReactElement {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className={styles["code-copy"]}
      onClick={() => {
        void navigator.clipboard
          .writeText(props.text)
          .then(() => {
            setCopied(true)
            setTimeout(() => {
              setCopied(false)
            }, COPIED_LABEL_DURATION_MS)
          })
          .catch(() => {})
      }}
    >
      {copied ? (
        <>
          <Check size={12} strokeWidth={2} aria-hidden="true" />
          コピーした
        </>
      ) : (
        <>
          <Copy size={12} strokeWidth={2} aria-hidden="true" />
          コピー
        </>
      )}
    </button>
  )
}
