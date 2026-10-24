// 撮影の道具が場面を引く疑似セッション。`--session` のファイルか、無ければ同梱のファイル。

import {
  type FakeSession,
  readFakeSession,
} from "../../../src/server/session-driver/adapter/fake-session.ts"

export type SceneSessionReading =
  | { readonly kind: "read"; readonly session: FakeSession }
  | { readonly kind: "unreadable"; readonly message: string }

/** `sessionPath` が undefined なら同梱のファイルを読む。読めなければ、どのファイルかを添えた理由を返す。 */
export function readSceneSession(sessionPath: string | undefined): SceneSessionReading {
  const reading = readFakeSession(sessionPath)
  return reading.kind === "read"
    ? reading
    : {
        kind: "unreadable",
        message: `${sessionPath ?? "fixture/fake-session/index.json"} が読めない: ${reading.reason}`,
      }
}
