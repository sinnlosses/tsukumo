// 駆動へ引きに行く3つの問い合わせ（コンテキストの内訳・プラン使用量・セッション1件の中身）。
// 押すのではなく引くので、状態にもフレームにも乗らない。駆動への問い合わせが失敗したときは足跡を残して「取れない」を返す。

import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../shared/session/session-digest.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../../shared/usage/context-usage.ts"
import { UNAVAILABLE_PLAN_USAGE } from "../../../shared/usage/plan-usage.ts"
import type { DiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"
import type { SessionManager } from "./session-manager-port.ts"

type DriverReadPorts = {
  /** いまの代の駆動。呼んだ時点のものを返す。 */
  readonly driver: () => Promise<SessionDriver>
  readonly state: () => SessionState
  readonly diagnostic: DiagnosticBuffer
  readonly now: () => number
}

export function createDriverRead(
  ports: DriverReadPorts,
): Pick<SessionManager, "readContextUsage" | "readPlanUsage" | "readSessionDigest"> {
  return {
    readContextUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。画面の札が1枚出ないだけで、常駐プロセスは落とさない。
      try {
        const started = await ports.driver()
        return await started.readContextUsage()
      } catch (error) {
        ports.diagnostic.add(
          swallowedFailureFootprint(
            ports.now(),
            { feature: "session", place: "read-context-usage" },
            error,
          ),
        )
        return UNAVAILABLE_CONTEXT_USAGE
      }
    },
    readPlanUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。
      try {
        const started = await ports.driver()
        return await started.readPlanUsage()
      } catch (error) {
        ports.diagnostic.add(
          swallowedFailureFootprint(
            ports.now(),
            { feature: "session", place: "read-plan-usage" },
            error,
          ),
        )
        return UNAVAILABLE_PLAN_USAGE
      }
    },
    readSessionDigest: async (sessionId) => {
      if (!isReadableSession(ports.state(), sessionId)) {
        return UNAVAILABLE_SESSION_DIGEST
      }
      try {
        const started = await ports.driver()
        return await started.readSessionDigest(sessionId)
      } catch (error) {
        ports.diagnostic.add(
          swallowedFailureFootprint(
            ports.now(),
            { feature: "session", place: "read-session-digest" },
            error,
          ),
        )
        return UNAVAILABLE_SESSION_DIGEST
      }
    },
  }
}

/** 画面から中身を頼まれてよいセッションか（一覧に載ったものか、いま出しているもの）。 */
function isReadableSession(state: SessionState, sessionId: string): boolean {
  return (
    state.sessions.some((session) => session.sessionId === sessionId) ||
    (state.session.kind !== "starting" && state.session.sessionId === sessionId)
  )
}
