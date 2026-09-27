// `visit` が受けるコマンドの表（`docs/design.md`「コマンドの受け手と手続きの置き方」）。
// 手続き（`visitProcedure`）がここの行へ委ねる。

import type { visitContract } from "../../../shared/contract/visit.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { FeatureCommandTable } from "../../core/command-receiver.ts"

export type VisitCommandPorts = {
  /**
   * 歯車の「訪問」のオン・オフを覚え、画面へ流す `visit-enabled-changed` を返す（覚え先は
   * `~/.tsukumo/state.json`。`docs/screen-design.md`「設定の置き場所」）。書き込みは失敗しても投げない口なので、
   * 返すイベントは常に1つ。
   */
  readonly rememberVisitEnabled: (visitEnabled: boolean) => SessionEvent
}

/** `visit` が受けるコマンドの表。 */
export function visitCommands(ports: VisitCommandPorts): FeatureCommandTable<typeof visitContract> {
  return {
    // 起こし直さないが、`session.setSessionDefault` と違っていま動いているセッションにも即座に
    // 効く——流した `visit-enabled-changed` は駆動由来のイベントと同じ道で畳まれ、訪問の見張りにも
    // 届く（オフなら来ない・訪問中なら帰る。判断は訪問の判断側が持つ）。
    setEnabled: {
      kind: "write",
      receive: (input) => ports.rememberVisitEnabled(input.enabled),
      failure: FRAME_ERROR_REASON.visitEnabledFailed,
    },
  }
}
