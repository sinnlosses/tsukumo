// `host` が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。

import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type FeatureCommandTable, NO_COMMAND_GUARD } from "../../core/command-receiver.ts"

export type HostCommandPorts = {
  /**
   * レポートに書かれたパスを Orca のエディタで開き、開けたかどうかを返す。**git 管理下の一覧に
   * あるかの確かめ**（`tracked-file.ts`）と `Host.openFile` の呼び出しは配線が組んで渡す。
   */
  readonly openFile: (path: string) => Promise<boolean>
}

/** `host` が受けるコマンドの表。 */
export function hostCommands(ports: HostCommandPorts): FeatureCommandTable<"open-file"> {
  return {
    // **起こし直さない。画面の状態も動かさない**ので流すイベントも無い（開けた・開けなかったは
    // `error` フレーム越しにだけ伝わる。`docs/display.md` 4.2「各表示物」）。
    "open-file": {
      ...NO_COMMAND_GUARD,
      kind: "call",
      receive: (command) => ports.openFile(command.path),
      failure: FRAME_ERROR_REASON.openFileFailed,
    },
  }
}
