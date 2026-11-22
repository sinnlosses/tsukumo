// フェンス付きコードブロックの `text`（全文。shell の塊はコマンドだけ）をクリップボードへ写すボタン。
// 写ったことは、短い間だけ絵を check に変えて示す。

import { useState, type ReactElement } from "react"

import { CheckIcon, CopyIcon } from "../../../components/ui/icon/icon.tsx"
import { SmallIconButton } from "../../../components/ui/small-icon-button/small-icon-button.tsx"
import { reportExportMark } from "../report-export-copy.ts"
import styles from "./report-notation.module.css"

/** 写した印（check の絵）を保つ長さ（ミリ秒）。 */
const COPIED_MARK_DURATION_MS = 1500

export function CopyButton(props: { readonly text: string }): ReactElement {
  const [copied, setCopied] = useState(false)

  return (
    <span {...reportExportMark.drop} className={styles["report-export-drop"]}>
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
    </span>
  )
}
