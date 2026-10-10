// このプロセスがいま持っているセッションのIDを名乗り、ほかの tsukumo の名乗りと突き合わせる。
// 名乗りに載せるのは pid とセッションIDだけ（会話の中身・見出し・ポート・印は載せない）。
// 書き置きと生存の確かめは渡された `SessionClaimStore` 越しに頼み、ここは外の世界に触らない。

import { isPlainObject } from "remeda"

import { MAX_SESSION_ID_LENGTH } from "../../../shared/session/session-choice.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionStart } from "./session-driver.ts"

/** 起こす直前に選んだIDを名乗れたか（`reserved`）、別の窓が使っていたか（`occupied`）。 */
export type SessionReservation = "reserved" | "occupied"

/** 名乗りの書き置きの口。 */
export type SessionClaimStore = {
  /** 自分の名乗りを書き換える。空なら自分の名乗りを消す。投げない。 */
  readonly write: (sessionIds: readonly string[]) => void
  /** 生きているほかのプロセスが名乗ったセッションのID。読めないときは空。 */
  readonly readOthers: () => Promise<readonly string[]>
}

export type SessionClaim = {
  /**
   * 駆動を起こすときに呼ぶ。続きからならそのIDを、新規なら何も名乗らない。
   * 戻り値はその代の駆動のイベントを見る口で、`session-info` のIDへ名乗り替え、`session-ended` でその代の名乗りだけを外す。
   * あとの代を起こしたあと（と `withdraw` のあと）は、前の代の口に届いたイベントを捨てる（閉じた駆動の `session-ended` は後から届く）。
   */
  readonly noteLaunched: (start: SessionStart) => (event: SessionEvent) => void
  /**
   * 起こし直す前に、選んだIDを名乗りに足してからほかの名乗りを読む。
   * ほかに同じIDがあれば足したIDを外して `occupied` を返す（同時に選んだ2つの窓は、少なくとも一方が相手を見る）。
   */
  readonly reserve: (sessionId: string) => Promise<SessionReservation>
  /** 名乗りを消す（起こし直しに失敗したとき・閉じるとき）。 */
  readonly withdraw: () => void
}

/** 名乗りのファイル1つの中身。 */
export type SessionClaimRecord = {
  readonly pid: number
  readonly sessionIds: readonly string[]
}

export function createSessionClaim(store: SessionClaimStore): SessionClaim {
  let held: readonly string[] = []
  // 何代目の駆動の名乗りか。古い代の口に届いたイベントを捨てるのに使う。
  let launchCount = 0

  const hold = (sessionIds: readonly string[]): void => {
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
      // この代が名乗っているID（0か1つ）。起こし直す前に予約したIDは含まない。
      let own: readonly string[] = start.kind === "resume" ? [start.sessionId] : []
      hold(own)
      return (event) => {
        if (born !== launchCount) {
          return
        }
        if (event.kind === "session-info") {
          const next = [event.sessionId]
          hold([...held.filter((id) => !own.includes(id) && id !== event.sessionId), ...next])
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

/** 名乗りのファイルの中身（外来の値）を読む。形が違えば undefined。 */
export function readSessionClaimRecord(value: unknown): SessionClaimRecord | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const { pid, sessionIds } = value
  return typeof pid === "number" &&
    Number.isSafeInteger(pid) &&
    pid > 0 &&
    Array.isArray(sessionIds) &&
    sessionIds.every(isSessionId)
    ? { pid, sessionIds }
    : undefined
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => right[index] === id)
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= MAX_SESSION_ID_LENGTH
}
