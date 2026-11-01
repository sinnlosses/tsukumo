// 読み終えたセッションの中身を、transcript の更新時刻と大きさを添えて覚える。
// 覚えるのは中身（`known`）だけで、読めなかった回は残さない。

import type { SessionDigest } from "../../../shared/session/session-digest.ts"
import type { SessionId } from "./session-id.ts"

/** transcript のファイルが変わったかを見分ける印。 */
export type TranscriptStamp = {
  readonly lastModified: number
  readonly fileSize: number
}

export type SessionDigestCache = {
  /** 同じ印で覚えた中身を返す。覚えていない・印が違うときは undefined。 */
  readonly get: (sessionId: SessionId, stamp: TranscriptStamp) => SessionDigest | undefined
  readonly set: (sessionId: SessionId, stamp: TranscriptStamp, digest: SessionDigest) => void
}

/** {@link SessionDigestCache} を1つ作る。セッションごとに最新の1件だけ持つ。 */
export function createSessionDigestCache(): SessionDigestCache {
  const entries = new Map<
    SessionId,
    { readonly stamp: TranscriptStamp; readonly digest: SessionDigest }
  >()

  return {
    get: (sessionId, stamp) => {
      const entry = entries.get(sessionId)
      return entry !== undefined && isSameStamp(entry.stamp, stamp) ? entry.digest : undefined
    },
    set: (sessionId, stamp, digest) => {
      if (digest.kind === "known") {
        entries.set(sessionId, { stamp, digest })
      }
    },
  }
}

function isSameStamp(a: TranscriptStamp, b: TranscriptStamp): boolean {
  return a.lastModified === b.lastModified && a.fileSize === b.fileSize
}
