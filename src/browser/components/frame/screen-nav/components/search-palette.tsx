// 探す（⌘K）。画面の上の方に浮かぶ1枚で、打った字で絞った一覧を ↑ ↓・Ctrl+N・Ctrl+P と Enter で選ぶ。
// Esc と覆いを押すと閉じる（どちらも `<Dialog>` が持つ）。中身は開いているあいだだけ描く。

import type { ReactElement } from "react"

import { CommandList } from "../../../ui/command-row/command-row.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import type { SearchPaletteView } from "../hooks/use-search-palette.ts"
import styles from "./search-palette.module.css"

const LABEL = "探す"
const PLACEHOLDER = "画面・タスク・コマンドを探す"
const EMPTY = "当てはまるものが無い"

export function SearchPalette(props: { readonly search: SearchPaletteView }): ReactElement {
  const { search } = props
  return (
    <Dialog
      open={search.open}
      ariaLabel={LABEL}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={search.onClose}
      className={styles["search-palette"]}
    >
      {search.open && (
        <CommandList
          ariaLabel={LABEL}
          search={{
            kind: "field",
            ariaLabel: LABEL,
            placeholder: PLACEHOLDER,
            value: search.query,
            onChange: search.onQueryChange,
          }}
          items={search.entries}
          empty={EMPTY}
          onSelect={search.onSelect}
        />
      )}
    </Dialog>
  )
}
