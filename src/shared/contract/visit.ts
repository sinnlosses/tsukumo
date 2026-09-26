// 訪問のコマンドの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/visit/adapter/visit-procedure.ts`、委ね先の行は `src/server/visit/core/visit-command.ts`。

import { z } from "zod"

import { commandBase } from "../command.ts"

export const visitContract = {
  /**
   * 歯車の「訪問」のオン・オフ（`docs/screen-design.md` 13.6・13.9「設定の歯車」）。
   * `session.setSessionDefault` と違い、いま動いているセッションに即座に効く。
   */
  setEnabled: commandBase.input(z.object({ enabled: z.boolean() })),
}
