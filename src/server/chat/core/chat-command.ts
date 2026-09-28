// `chat` が受けるコマンドの表。断る条件は契約 `chatContract` の `meta`。

import type { chatContract } from "../../../shared/contract/chat.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { FeatureCommandTable } from "../../core/command-receiver.ts"

export type ChatCommandPorts = {
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消し、流し直す `remembered-lines-changed` を返す。
   * 受け付けられなかったときは undefined。セッションは起こし直さない。
   */
  readonly forgetRememberedLine: (line: string) => Promise<SessionEvent | undefined>
}

/** `chat` が受けるコマンドの表。 */
export function chatCommands(ports: ChatCommandPorts): FeatureCommandTable<typeof chatContract> {
  return {
    forgetRememberedLine: {
      kind: "write",
      receive: (input) => ports.forgetRememberedLine(input.line),
      failure: FRAME_ERROR_REASON.forgetRememberedLineFailed,
    },
  }
}
