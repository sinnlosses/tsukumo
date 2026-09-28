// コンテキストの内訳を記録に残すときの書き口の契約と、セッション1つにつき1行だけ書く係（`ContextUsageRecorder`）。
//
// この係は駆動の世代をまたいで持つ（世代ごとの持ち物には入れない）。
// 続きから起こして同じセッションIDになったときは同じセッションなので、2行目を書かない。
//
// 数と名前しか通らない。
// 会話の文面・ツールの引数と結果は `ContextUsageEntry` に口が無く、書いてよいものの線は `ContextUsageRecord` が引いている。

import {
  type ContextUsage,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../shared/context-usage/context-usage.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import type { TokenUsageMode } from "../../../shared/token-usage/token-usage.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"

/**
 * 1セッションぶんの記録（書き出す行そのものではない）。
 * `at` はエポックミリ秒で、ISO 8601 への変換と日付ごとのファイルの選択は `adapter` 側の仕事。
 */
export type ContextUsageEntry = {
  readonly at: number
  /** claude 側のセッションID。同じIDで二度渡さないのは呼ぶ側の責任。 */
  readonly sessionId: string
  readonly mode: TokenUsageMode
  readonly usage: ContextUsage
}

/**
 * コンテキストの内訳の書き込み口。
 * 読み口は持たない（この記録を読むのは tsukumo の外で、プロセスの中で読み戻す相手がいない）。
 * 書けなくても例外を投げず、受け付けたかどうかは返さない。
 */
export type ContextUsageLog = {
  readonly append: (entry: ContextUsageEntry) => void
}

/**
 * そのセッションのコンテキストの内訳を記録に残す係（セッション1つにつき1回だけ）。
 * ターンごとに残さないのは、内訳のうちメッセージ以外がセッションの中でほぼ変わらないから。
 */
export type ContextUsageRecorder = {
  /**
   * ターンが終わるたびに呼ばれ、まだ書いていないセッションIDのときだけ問い合わせる。
   * 取れなかったら印を戻して次のターンでまた試す（あとのターンで取ってもほぼ同じ値になる）。
   * 問い合わせは待たされる口なので、先に印を立てて二重に走らせない（同じセッションで次のターンが先に終わっても、問い合わせは1本だけ）。
   *
   * claude 側のセッションIDが分からないうちは何もしない（行だけで「どのセッションか」が決まらない記録を積まないため）。
   * 呼ぶ側は起き上がっている駆動を渡す。
   */
  readonly recordOnce: (state: SessionState, at: number, driver: SessionDriver) => Promise<void>
}

/** {@link ContextUsageRecorder} を1つ起こす（世代をまたいで持ち回る）。 */
export function createContextUsageRecorder(log: ContextUsageLog): ContextUsageRecorder {
  // 内訳を記録に残した claude 側のセッションID。このIDのあいだは二度と書かない（1行 = 1セッション）。
  let recordedSessionId: string | undefined = undefined

  return {
    recordOnce: async (state, at, driver) => {
      const sessionId = state.session.kind === "starting" ? undefined : state.session.sessionId
      if (sessionId === undefined || sessionId === recordedSessionId) {
        return
      }
      const mode: TokenUsageMode = state.chatMode ? "chat" : "work"
      recordedSessionId = sessionId
      const report = await readDriverContextUsage(driver)
      if (report.kind === "ready") {
        log.append({ at, sessionId, mode, usage: report.usage })
        return
      }
      if (recordedSessionId === sessionId) {
        recordedSessionId = undefined
      }
    },
  }
}

/**
 * 起き上がっている駆動に、いまのコンテキストの内訳を問い合わせる。投げてきた回は「取れない」に畳む。
 * 駆動が起き上がるのを待たない（記録を残す側は、起き上がっている駆動しか相手にしない）。
 */
async function readDriverContextUsage(driver: SessionDriver): Promise<ContextUsageReport> {
  try {
    return await driver.readContextUsage()
  } catch {
    return UNAVAILABLE_CONTEXT_USAGE
  }
}
