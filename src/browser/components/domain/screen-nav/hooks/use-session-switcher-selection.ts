// 切り替え画面の中の状態（探す欄の文字・選んでいる行）と、選んだ1件の中身の取得
// （`docs/screen-design.md`「切り替え画面」）。開くたびに作り直す部品の中で呼ぶので、
// 閉じて開き直すと探す欄も選びも初めに戻る。
//
// 探す欄が引くのは短縮IDと見出し（題が無ければ最初の依頼）だけで、タスク番号は見出しに
// 書かれていれば当たる。依頼の全文はブラウザに無いので引かない。

import { useState, type KeyboardEvent } from "react"

import { useSessionDigest, type SessionDigestView } from "./use-session-digest.ts"
import type { SessionSwitcherRow } from "./use-session-switcher.ts"

export type SessionSwitcherSelection = {
  readonly query: string
  readonly onQueryChange: (query: string) => void
  /** 探す欄で絞ったあとの行（並びは一覧のまま）。 */
  readonly rows: readonly SessionSwitcherRow[]
  /** 選んでいる行。絞った結果が0件なら無い。 */
  readonly selected: SessionSwitcherRow | undefined
  readonly digest: SessionDigestView
  readonly onSelect: (sessionId: string) => void
  /** 探す欄のキー操作（↑↓ か Ctrl+P / Ctrl+N で選び、Enter で切り替える。Esc は `<dialog>` が閉じる）。 */
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function useSessionSwitcherSelection(
  allRows: readonly SessionSwitcherRow[],
  onSwitch: (sessionId: string) => void,
): SessionSwitcherSelection {
  const [query, setQuery] = useState("")
  // 開いた直後は、いま出しているもの以外でいちばん新しい行を選ぶ（切り替えたい先はふつうそちら）。
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => (allRows.find((row) => !row.current) ?? allRows[0])?.sessionId,
  )

  const rows = allRows.filter((row) => matches(row, query))
  const selected = rows.find((row) => row.sessionId === selectedId) ?? rows[0]
  const digest = useSessionDigest(selected?.sessionId)

  const move = (step: number): void => {
    const index = rows.findIndex((row) => row.sessionId === selected?.sessionId)
    const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)]
    if (next !== undefined) {
      setSelectedId(next.sessionId)
    }
  }

  return {
    query,
    onQueryChange: setQuery,
    rows,
    selected,
    digest,
    onSelect: setSelectedId,
    onKeyDown: (event) => {
      if (event.nativeEvent.isComposing) {
        return
      }
      if (event.key === "ArrowDown" || (event.ctrlKey && !event.metaKey && event.key === "n")) {
        event.preventDefault()
        move(1)
      }
      if (event.key === "ArrowUp" || (event.ctrlKey && !event.metaKey && event.key === "p")) {
        event.preventDefault()
        move(-1)
      }
      if (event.key === "Enter" && selected !== undefined) {
        event.preventDefault()
        onSwitch(selected.sessionId)
      }
    },
  }
}

function matches(row: SessionSwitcherRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return (
    needle === "" ||
    row.shortId.toLowerCase().includes(needle) ||
    row.heading.toLowerCase().includes(needle)
  )
}
