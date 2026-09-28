// 訪問のコマンドの契約。

import { z } from "zod"

import { commandBase } from "../command.ts"

export const visitContract = {
  /** 歯車の「訪問」のオン・オフ。いま動いているセッションに即座に効く。 */
  setEnabled: commandBase.input(z.object({ enabled: z.boolean() })),
}
