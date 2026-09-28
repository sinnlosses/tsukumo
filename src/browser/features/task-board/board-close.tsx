// 確認から、それを包んでいる表を閉じる口。
// 送ったあとに表まで閉じるのは、メインビューに並んだ依頼が画面いっぱいの表に隠れるため。
//
// props で降ろさない。
// 確認を組み立てるのは押されたIDのボタンで、そこまでの道に表の都合を知らない部品（`TaskTable`・`TaskRow`・`TaskItem`）が挟まっている。

import { createContext, useContext } from "react"

/** 包んでいる表が無ければ `undefined`（サイドバーの区画の一覧から開いた確認がそれ）。 */
export const BoardCloseContext = createContext<(() => void) | undefined>(undefined)

/**
 * 包んでいる表を閉じる。Provider の外で呼んでも落とさない。
 * 区画の一覧から開いた確認には閉じる器が無く、それは配線の誤りではないので何もしない。
 */
export function useBoardClose(): () => void {
  return useContext(BoardCloseContext) ?? NOTHING_TO_CLOSE
}

const NOTHING_TO_CLOSE = (): void => {}
