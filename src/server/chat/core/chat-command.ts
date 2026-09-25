// `chat` が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。

import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type FeatureCommandTable } from "../../core/command-receiver.ts"

export type ChatCommandPorts = {
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消し、**流し直す
   * `remembered-lines-changed` を返す**（書き込み先と受け付けない条件は
   * `src/server/chat/adapter/persona-memory.ts` の `forgetRememberedLineFromScreen`）。受け付けられ
   * なかったときは undefined。セッションは起こし直さない。
   */
  readonly forgetRememberedLine: (line: string) => Promise<SessionEvent | undefined>
}

/** `chat` が受けるコマンドの表。 */
export function chatCommands(
  ports: ChatCommandPorts,
): FeatureCommandTable<"forget-remembered-line"> {
  return {
    // サイドバーの「覚えていること」自体が雑談中にしか出ないので、雑談の外なら断る。
    "forget-remembered-line": {
      kind: "write",
      chatOnly: FRAME_ERROR_REASON.forgetRememberedLineOutsideChat,
      idleTurn: false,
      receive: (command) => ports.forgetRememberedLine(command.line),
      failure: FRAME_ERROR_REASON.forgetRememberedLineFailed,
    },
  }
}
