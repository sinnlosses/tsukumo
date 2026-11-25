// フェンス付きコードブロックの `text`（全文。shell の塊はコマンドだけ）をクリップボードへ写すボタン。
// HTML に書き出すときは落とす印を付ける。

import type { ReactElement } from "react"

import { CopyIconButton } from "../../../components/ui/copy-icon-button/copy-icon-button.tsx"
import { reportExportMark } from "../report-export-copy.ts"
import styles from "./report-notation.module.css"

export function CopyButton(props: { readonly text: string }): ReactElement {
  return (
    <span {...reportExportMark.drop} className={styles["report-export-drop"]}>
      <CopyIconButton text={props.text} />
    </span>
  )
}
