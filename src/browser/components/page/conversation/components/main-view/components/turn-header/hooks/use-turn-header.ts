// `<TurnHeader>` のロジック。
// 前後のターンの id・見ているターンのタイトルを、画面に出す形へ畳んで返す。
// 「n / N」は古いほうを1とする通し番号。

import type { HeadNotice, HeadNoticeAction } from "../../../domain/head-notice.ts"
import { neighborTurnId } from "../../../domain/turn-step-key.ts"

/**
 * 札の頭に出す1件ぶん。
 * `requestRest` はタイトルに取られた行より後ろの依頼の行で、札の頭のタイトルの下に出す。
 */
export type TurnHeaderEntry = {
  readonly id: number
  readonly title: string
  readonly requestRest: readonly string[]
}

export type TurnHeaderProps = {
  /** 窓の中のターン。古い順（末尾が最新）。 */
  readonly turns: readonly TurnHeaderEntry[]
  readonly activeTurnId: number
  readonly onSelect: (turnId: number) => void
  /** 知らせの行。出すものがあれば、「最新」の印と「最新へ」の口の席を代わりに使う。 */
  readonly notice: HeadNotice
  readonly onNotice: (action: HeadNoticeAction) => void
}

/** `<TurnHeader>` が画面に出す形。 */
export type TurnHeaderModel = {
  readonly olderDisabled: boolean
  readonly onOlder: () => void
  readonly isNewest: boolean
  readonly onNewer: () => void
  readonly activeTitle: string | undefined
  readonly activeTurnId: number
  readonly activeRequestRest: readonly string[]
  readonly positionLabel: string
  readonly onToNewest: () => void
  readonly notice: HeadNotice
  readonly onNotice: () => void
}

export function useTurnHeader(props: TurnHeaderProps): TurnHeaderModel {
  const index = props.turns.findIndex((turn) => turn.id === props.activeTurnId)
  const turnIds = props.turns.map((turn) => turn.id)
  const older = neighborTurnId(turnIds, props.activeTurnId, "older")
  const newer = neighborTurnId(turnIds, props.activeTurnId, "newer")
  const newest = props.turns.at(-1)?.id
  // `noUncheckedIndexedAccess` が生む `| undefined`（docs/coding-standards.md「「無いかもしれない」値」）。
  // 呼び出し側は必ず `turns` に含まれる id を渡す契約だが、畳まずそのまま使う。
  const activeTitle = props.turns[index]?.title
  const activeRequestRest = props.turns[index]?.requestRest ?? []

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
    activeTurnId: props.activeTurnId,
    activeRequestRest,
    positionLabel: `${String(index + 1)} / ${String(props.turns.length)}`,
    onToNewest: () => {
      if (newest !== undefined) {
        props.onSelect(newest)
      }
    },
    notice: props.notice,
    onNotice: () => {
      if (props.notice.kind === "notice") {
        props.onNotice(props.notice.action)
      }
    },
  }
}
