// タスクのモーダルの左の一覧の幅。`localStorage` に幅（px）だけ保存する。
// 読み書きに失敗しても既定（CSS の 470px）へ落ちるだけで、例外は投げない。

import { z } from "zod"

import { localPreference, type LocalPreferenceCodec } from "../../../utils/local-preference.ts"

// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
// 一覧の最小幅と詳細の最小幅は、CSS の `.task-board-list-column` の `clamp` と揃える。
const TASK_BOARD_LIST_WIDTH_MIN_PX = 300
const TASK_BOARD_LIST_WIDTH_MAX_PX = 760
const DETAIL_MIN_PX = 360

// 幅は JSON でなく数値の文字列（`"470"`）で保存されている。
const pxCodec: LocalPreferenceCodec<number | undefined> = {
  parse: (raw) => Number(raw),
  serialize: (value) => String(value),
}

const preference = localPreference<number | undefined>(
  "tsukumo-task-board-list-width:v1",
  z.union([
    z.number().min(TASK_BOARD_LIST_WIDTH_MIN_PX).max(TASK_BOARD_LIST_WIDTH_MAX_PX),
    z.undefined(),
  ]),
  undefined,
  pxCodec,
)

/** `LayoutResizer` の `toValue` にそのまま渡す。比率（0〜1）を、詳細の幅を残した可動域つきの px にする。 */
export function taskBoardListWidthFromRatio(ratio: number, rect: DOMRect): number {
  const max = Math.min(TASK_BOARD_LIST_WIDTH_MAX_PX, rect.width - DETAIL_MIN_PX)
  return Math.max(TASK_BOARD_LIST_WIDTH_MIN_PX, Math.min(max, Math.round(ratio * rect.width)))
}

/** 保存した幅。まだ一度も動かしていない・読めないときは `undefined`（CSS の既定に任せる）。 */
export const loadTaskBoardListWidth: () => number | undefined = preference.load

export function saveTaskBoardListWidth(px: number): void {
  preference.save(px)
}
