// 雑談のコマンドの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/chat/adapter/chat-procedure.ts`、委ね先の行は `src/server/chat/core/chat-command.ts`。

import { z } from "zod"

import { commandBase } from "../command.ts"
import { FRAME_ERROR_REASON } from "../frame.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../persona-memory.ts"

export const chatContract = {
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消す（`docs/design.md` 7.1「1行だけ
   * 忘れる」）。**指し方はキャラクター自身の `forget` ツールと同じ完全一致**——チップに出した
   * 文面（`- ` を外した1行）をそのまま送る。書き込みは
   * `src/server/chat/adapter/persona-memory.ts` の `forgetRememberedLineFromScreen` を通し、
   * 1ターン1行の上限（モデルの `forget` の上限）は掛からない。サイドバーの「覚えていること」
   * 自体が雑談中にしか出ないので、雑談の外なら断る。
   */
  forgetRememberedLine: commandBase
    .meta({ chatOnly: FRAME_ERROR_REASON.forgetRememberedLineOutsideChat, idleTurn: false })
    .input(z.object({ line: z.string().min(1).max(MAX_REMEMBERED_LINE_LENGTH) })),
}
