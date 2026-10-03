// `host` が受けるコマンドの表。

import type { hostContract } from "../../../shared/contract/host.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import type { FeatureCommandTable } from "../../core/command-receiver.ts"

export type HostCommandPorts = {
  /**
   * レポートに書かれたパスをホストのエディタで開き、開けたかどうかを返す。
   * git 管理下の一覧にあるかの確かめ（`openTrackedFile`）を通したものを渡す。
   */
  readonly openFile: (path: string) => Promise<boolean>
}

/** `host` が受けるコマンドの表。 */
export function hostCommands(ports: HostCommandPorts): FeatureCommandTable<typeof hostContract> {
  return {
    // 起こし直さない。画面の状態も動かさないので流すイベントも無い（開けた・開けなかったは手続きの応答でだけ伝わる）。
    openFile: {
      kind: "call",
      receive: (input) => ports.openFile(input.path),
      failure: FRAME_ERROR_REASON.openFileFailed,
    },
  }
}
