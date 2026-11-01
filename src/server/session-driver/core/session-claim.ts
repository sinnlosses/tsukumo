// このプロセスがいま持っているセッションのIDを占有ファイルに書き、ほかの tsukumo の占有ファイルと突き合わせる。
// 占有ファイルに載せるのは pid とセッションIDだけ（会話の中身・見出し・ポート・印は載せない）。
// 書き置きと生存の確かめは渡された `SessionClaimStore` 越しに頼み、ここは外の世界に触らない。

import { isPlainObject } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionStart } from "./session-driver.ts"
import { parseSessionId, type SessionId } from "./session-id.ts"

/** 起こす直前に選んだIDを占有ファイルに書けたか（`reserved`）、別の窓が使っていたか（`occupied`）。 */
export type SessionReservation = "reserved" | "occupied"

/** 占有ファイルの書き置きの口。 */
export type SessionClaimStore = {
  /** 自分の占有ファイルを書き換える。空なら自分の占有ファイルを消す。投げない。 */
  readonly write: (sessionIds: readonly SessionId[]) => void
  /** 生きているほかのプロセスが占有ファイルに書いたセッションのID。読めないときは空。 */
  readonly readOthers: () => Promise<readonly SessionId[]>
}

export type SessionClaim = {
  /**
   * 駆動を起こすときに呼ぶ。続きからならそのIDを、新規なら何も書かない。
   * 戻り値はその代の駆動のイベントを見る口で、`session-info` のIDへ書き替え、`session-ended` でその代の分だけを占有ファイルから外す。
   * `withdraw` のあと（と、あとの代を起こしたあと）は、前の代の口に届いたイベントを捨てる。
   * 起こし直しの失敗と閉じるときは代がいまのままなので、代の絞りでは外れず、この印が要る。
   */
  readonly noteLaunched: (start: SessionStart) => (event: SessionEvent) => void
  /**
   * 起こし直す前に、選んだIDを占有ファイルに足してからほかの占有ファイルを読む。
   * ほかに同じIDがあれば足したIDを外して `occupied` を返す（同時に選んだ2つの窓は、少なくとも一方が相手を見る）。
   */
  readonly reserve: (sessionId: SessionId) => Promise<SessionReservation>
  /** 占有ファイルを消す（起こし直しに失敗したとき・閉じるとき）。 */
  readonly withdraw: () => void
}

/** 占有ファイル1つの中身。 */
export type SessionClaimRecord = {
  readonly pid: number
  readonly sessionIds: readonly SessionId[]
}

export function createSessionClaim(store: SessionClaimStore): SessionClaim {
  let held: readonly SessionId[] = []
  // 何代目の駆動の占有ファイルか。`withdraw` のあとに届くイベントを捨てるのに使う。
  let launchCount = 0

  const hold = (sessionIds: readonly SessionId[]): void => {
    if (sameIds(held, sessionIds)) {
      return
    }
    held = sessionIds
    store.write(held)
  }

  return {
    noteLaunched: (start) => {
      launchCount += 1
      const born = launchCount
      // この代が占有ファイルに書いているID（0か1つ）。起こし直す前に予約したIDは含まない。
      let own: readonly SessionId[] = start.kind === "resume" ? [start.sessionId] : []
      hold(own)
      return (event) => {
        if (born !== launchCount) {
          return
        }
        if (event.kind === "session-info") {
          const sessionId = parseSessionId(event.sessionId)
          if (sessionId === undefined) {
            return
          }
          const next = [sessionId]
          hold([...held.filter((id) => !own.includes(id) && id !== sessionId), ...next])
          own = next
        }
        if (event.kind === "session-ended") {
          hold(held.filter((id) => !own.includes(id)))
          own = []
        }
      }
    },
    reserve: async (sessionId) => {
      const added = !held.includes(sessionId)
      if (added) {
        hold([...held, sessionId])
      }
      const others = await store.readOthers()
      if (!others.includes(sessionId)) {
        return "reserved"
      }
      if (added) {
        hold(held.filter((id) => id !== sessionId))
      }
      return "occupied"
    },
    withdraw: () => {
      launchCount += 1
      hold([])
    },
  }
}

/** 占有ファイルの中身（外来の値）を読む。形が違えば undefined。 */
export function readSessionClaimRecord(value: unknown): SessionClaimRecord | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const { pid } = value
  const sessionIds = parseSessionIds(value.sessionIds)
  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0 && sessionIds !== undefined
    ? { pid, sessionIds }
    : undefined
}

function sameIds(left: readonly SessionId[], right: readonly SessionId[]): boolean {
  return left.length === right.length && left.every((id, index) => right[index] === id)
}

function parseSessionIds(value: unknown): readonly SessionId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const parsed = value.flatMap((id: unknown) => {
    const checked = typeof id === "string" ? parseSessionId(id) : undefined
    return checked === undefined ? [] : [checked]
  })
  return parsed.length === value.length ? parsed : undefined
}
