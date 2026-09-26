// `<TurnHeader>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 前後のターンの id・見ているターンのタイトル・一覧の開閉と並びを、画面に出す形へ畳んで返す。
//
// 開閉は帯に前例がある `browser/hooks/use-dismiss-signal.ts` の `useDismissSignal`
// （もう一度押す・外側・Esc で閉じる。Esc は開く口へフォーカスを戻す）。行を選ぶとその場で
// 閉じてターンを移す——最新の行を選べば `onSelect` の先（`stores/turn-selection.tsx` の
// `selectTurn`）がそのまま追従に戻す規則を持っているので、ここで特別扱いはしない。
//
// 一覧の並びは新しいものを上にする。行の番号（n / N）は `‹` `›` の脇に出す「n / N」と
// 同じ、古いほうを1とする通し番号なので、並びを新しい順にしても数字自体は矛盾しない
// （最新の行だけは番号の代わりに「最新」を出す）。

import { useCallback, useId, useRef, useState, type RefObject } from "react"

import {
  useDismissSignal,
  type DismissCause,
} from "../../../../../../../../hooks/use-dismiss-signal.ts"

/**
 * 一覧の1行ぶんの見出しと全文（`main-view.tsx` が `domain/turn-title.ts` の `turnTitle` /
 * `turnHistoryText` で作る）。`title` は札の頭とアクセシブルネームに使う1行、
 * `historyText` は一覧の行に出す、選択してコピーできる依頼の全文（複数行を含む）で、
 * 別のもの。
 */
export type TurnHeaderEntry = {
  readonly id: number
  readonly title: string
  readonly historyText: string
}

export type TurnHeaderProps = {
  /** 窓の中のターン。古い順（末尾が最新）。 */
  readonly turns: readonly TurnHeaderEntry[]
  readonly activeTurnId: number
  readonly onSelect: (turnId: number) => void
}

/**
 * 開いた一覧の1行。番号は古いほうを1とする通し番号のまま、並びだけ新しい順（`toReversed`）。
 * `title` は飛ぶ口のアクセシブルネームに使う1行、`text` は行に出す選択できる依頼の全文
 * （`presentational-turn-header.tsx` の `TurnHistoryList`）。
 */
export type TurnHeaderHistoryRow = {
  readonly id: number
  readonly isActive: boolean
  readonly positionLabel: string
  readonly title: string
  readonly text: string
}

/** `<TurnHeader>` が画面に出す形。 */
export type TurnHeaderModel = {
  readonly olderDisabled: boolean
  readonly onOlder: () => void
  readonly isNewest: boolean
  readonly onNewer: () => void
  readonly activeTitle: string | undefined
  readonly positionLabel: string
  readonly onToNewest: () => void
  readonly historyOpen: boolean
  readonly historyListId: string
  /** 一覧の「外側」の基準（`useDismissSignal` の `rootRef`）。 */
  readonly titleGroupRef: RefObject<HTMLDivElement | null>
  readonly historyToggleRef: RefObject<HTMLButtonElement | null>
  readonly onToggleHistory: () => void
  readonly historyRows: readonly TurnHeaderHistoryRow[]
  readonly onSelectHistoryRow: (turnId: number) => void
}

const NEWEST_ROW_BADGE = "最新"

export function useTurnHeader(props: TurnHeaderProps): TurnHeaderModel {
  const index = props.turns.findIndex((turn) => turn.id === props.activeTurnId)
  const older = props.turns[index - 1]?.id
  const newer = props.turns[index + 1]?.id
  const newest = props.turns.at(-1)?.id
  // `noUncheckedIndexedAccess` が生む `| undefined`（`docs/coding-standards.md`「「無いかもしれない」
  // 値」）。呼び出し側は必ず `turns` に含まれる id を渡す契約だが、畳まずそのまま使う。
  const activeTitle = props.turns[index]?.title

  const [historyOpen, setHistoryOpen] = useState(false)
  const historyListId = useId()
  const titleGroupRef = useRef<HTMLDivElement>(null)
  const historyToggleRef = useRef<HTMLButtonElement>(null)

  const onDismissHistory = useCallback((cause: DismissCause): void => {
    setHistoryOpen(false)
    if (cause === "escape") {
      historyToggleRef.current?.focus()
    }
  }, [])

  useDismissSignal({ open: historyOpen, rootRef: titleGroupRef, onDismiss: onDismissHistory })

  return {
    olderDisabled: older === undefined,
    onOlder: () => {
      if (older !== undefined) {
        props.onSelect(older)
      }
    },
    isNewest: newer === undefined,
    onNewer: () => {
      if (newer !== undefined) {
        props.onSelect(newer)
      }
    },
    activeTitle,
    positionLabel: `${String(index + 1)} / ${String(props.turns.length)}`,
    onToNewest: () => {
      if (newest !== undefined) {
        props.onSelect(newest)
      }
    },
    historyOpen,
    historyListId,
    titleGroupRef,
    historyToggleRef,
    onToggleHistory: () => {
      setHistoryOpen((wasOpen) => !wasOpen)
    },
    historyRows: historyRows(props.turns, props.activeTurnId),
    onSelectHistoryRow: (turnId) => {
      setHistoryOpen(false)
      props.onSelect(turnId)
    },
  }
}

function historyRows(
  turns: readonly TurnHeaderEntry[],
  activeTurnId: number,
): readonly TurnHeaderHistoryRow[] {
  const total = turns.length
  return turns
    .map((turn, position) => ({
      id: turn.id,
      title: turn.title,
      text: turn.historyText,
      isActive: turn.id === activeTurnId,
      positionLabel:
        position === total - 1 ? NEWEST_ROW_BADGE : `${String(position + 1)} / ${String(total)}`,
    }))
    .toReversed()
}
