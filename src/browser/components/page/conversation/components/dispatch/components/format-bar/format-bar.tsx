// マークダウンエディタの面の上に並ぶ書式のボタンの行。

import { Bold, Code, Italic, Link, List, Quote, Strikethrough, type LucideIcon } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import {
  formatEdit,
  type FormatEdit,
  type FormatTarget,
  type MarkdownFormat,
} from "./domain/markdown-format.ts"
import styles from "./format-bar.module.css"

export type FormatBarProps = {
  /** エディタの選択範囲を受けて変更を作る関数を渡す。適用はエディタの側が行う。 */
  readonly onFormat: (edit: (target: FormatTarget) => FormatEdit) => void
}

export function FormatBar({ onFormat }: FormatBarProps): ReactElement {
  return (
    <div role="toolbar" aria-label="書式" className={styles["format-bar"]}>
      {FORMAT_BUTTONS.map(({ format, label, Icon }) => (
        <Button
          key={format}
          type="button"
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel={label}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={label}
          className={styles["format-bar-button"]}
          onClick={() => {
            onFormat((target) => formatEdit(target, format))
          }}
        >
          <Icon size={ICON_SIZE} strokeWidth={1.8} />
        </Button>
      ))}
    </div>
  )
}

const ICON_SIZE = 18

const FORMAT_BUTTONS = [
  { format: "bold", label: "太字", Icon: Bold },
  { format: "italic", label: "斜体", Icon: Italic },
  { format: "strikethrough", label: "取り消し線", Icon: Strikethrough },
  { format: "code", label: "コード", Icon: Code },
  { format: "link", label: "リンク", Icon: Link },
  { format: "bullet", label: "箇条書き", Icon: List },
  { format: "quote", label: "引用", Icon: Quote },
] as const satisfies readonly {
  readonly format: MarkdownFormat
  readonly label: string
  readonly Icon: LucideIcon
}[]
