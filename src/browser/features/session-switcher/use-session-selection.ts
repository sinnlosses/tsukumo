// セッションの行のうち、選んでいる1件と、その1件の中身の取得。
// 別のウィンドウで使用中の行は選べない。切り替え画面と札の詳細が同じ選びを使う。

import { useState } from "react"

import type { SessionId } from "../../../shared/session/session-id.ts"
import type { SessionSwitcherRow } from "./session-switcher-row.ts"
import { useSessionDigest, type SessionDigestView } from "./use-session-digest.ts"

type SessionSelection = {
  /** 選んでいる行。選べる行が無ければ無い。 */
  readonly selected?: SessionSwitcherRow
  readonly digest: SessionDigestView
  /** 使用中の行は無視する。 */
  readonly select: (sessionId: SessionId) => void
  /** 使用中の行を飛ばして、選びを前後へ動かす。 */
  readonly move: (step: number) => void
}

export function useSessionSelection(
  rows: readonly SessionSwitcherRow[],
  initialId?: SessionId,
): SessionSelection {
  const [selectedId, setSelectedId] = useState(initialId)

  const selectable = rows.filter((row) => !row.occupiedElsewhere)
  // 選んでいた行が後から使用中になっても、いまの行へは落とさない。
  const selected =
    selectable.find((row) => row.sessionId === selectedId) ??
    selectable.find((row) => !row.current) ??
    selectable[0]
  const digest = useSessionDigest(
    selected === undefined ? { kind: "none" } : { kind: "session", sessionId: selected.sessionId },
  )

  return {
    selected,
    digest,
    select: (sessionId) => {
      if (selectable.some((row) => row.sessionId === sessionId)) {
        setSelectedId(sessionId)
      }
    },
    move: (step) => {
      const index = selectable.findIndex((row) => row.sessionId === selected?.sessionId)
      const next = selectable[Math.min(Math.max(index + step, 0), selectable.length - 1)]
      if (next !== undefined) {
        setSelectedId(next.sessionId)
      }
    },
  }
}
