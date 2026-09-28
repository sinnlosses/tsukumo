// 雑談のコマンドの契約。

import { z } from "zod"

import { MAX_REMEMBERED_LINE_LENGTH } from "../chat/persona-memory.ts"
import { commandBase } from "../command.ts"
import { FRAME_ERROR_REASON } from "../frame.ts"

export const chatContract = {
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消す。
   * 指し方は完全一致で、チップに出した文面（`- ` を外した1行）をそのまま送る。
   * 1ターン1行の上限（モデルの `forget` の上限）は掛からない。
   * サイドバーの「覚えていること」自体が雑談中にしか出ないので、雑談の外なら断る。
   */
  forgetRememberedLine: commandBase
    .meta({ chatOnly: FRAME_ERROR_REASON.forgetRememberedLineOutsideChat, idleTurn: false })
    .input(z.object({ line: z.string().min(1).max(MAX_REMEMBERED_LINE_LENGTH) })),
}
