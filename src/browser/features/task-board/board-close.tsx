// 確認（`components/task-run-confirm.tsx`）から、それを包んでいる表（`task-board.tsx`）を閉じる口。
// 送ったあとに表まで閉じるのは、メインビューに並んだ依頼が画面いっぱいの表に隠れるため。
//
// props で降ろさない。 確認を組み立てるのは押されたIDのボタン（`components/task-run-button.tsx`）で、
// そこまでの道に表の都合を知らない部品（`TaskTable`・`TaskRow`・`TaskItem`）が挟まっている。
// とくに `TaskTable` は `memo` で止めてあり、表を閉じる呼び先を通すとその前提が崩れる。
//
// 機能の中だけで配るので `browser/stores/` には上げない（画面全体で共有する状態ではない。
// docs/design.md 2章の箱の表）。

import { createContext, useContext } from "react"

/** 包んでいる表が無ければ `undefined`（サイドバーの区画の一覧から開いた確認がそれ）。 */
export const BoardCloseContext = createContext<(() => void) | undefined>(undefined)

/**
 * 包んでいる表を閉じる。Provider の外で呼んでも落とさない——区画の一覧から開いた確認には
 * 閉じる器が無く、それは配線の誤りではないので何もしない。
 */
export function useBoardClose(): () => void {
  return useContext(BoardCloseContext) ?? NOTHING_TO_CLOSE
}

const NOTHING_TO_CLOSE = (): void => {}
