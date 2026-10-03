// 何も開かないホスト（`TSUKUMO_HOST=none`）。
// ビューもファイルも開かず、理由つきの失敗を返す。
// 外部コマンドを起こさないので、どの環境でも同じに振る舞う。

import type { Host } from "../core/host.ts"

/** 何も開かないホストを作る。 */
export function createNoneHost(): Host {
  return {
    showView: () =>
      Promise.resolve({ ok: false, reason: "ホストが none なので開かない（URL を手で開く）" }),
    openFile: () => Promise.resolve({ ok: false, reason: "ホストが none なので開かない" }),
  }
}
