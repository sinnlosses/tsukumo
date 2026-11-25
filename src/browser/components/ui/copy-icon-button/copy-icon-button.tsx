// 文をクリップボードへ写す絵だけの小さなボタン。写ったことは、短い間だけ絵を check に変えて示す。

import { useState, type ReactElement } from "react"

import { CheckIcon, CopyIcon } from "../icon/icon.tsx"
import { SmallIconButton } from "../small-icon-button/small-icon-button.tsx"

/** 写した印（check の絵）を保つ長さ（ミリ秒）。 */
const COPIED_MARK_DURATION_MS = 1500

export function CopyIconButton(props: { readonly text: string }): ReactElement {
  const [copied, setCopied] = useState(false)

  return (
    <SmallIconButton
      label={copied ? "コピーした" : "コピー"}
      tooltip="コピー"
      onClick={() => {
        void navigator.clipboard
          .writeText(props.text)
          .then(() => {
            setCopied(true)
            setTimeout(() => {
              setCopied(false)
            }, COPIED_MARK_DURATION_MS)
          })
          .catch(() => {
            // クリップボードへ書けなかったときは写した印を出さないだけにする
          })
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </SmallIconButton>
  )
}
