// コンテキストの内訳を記録に残すときの書き口の契約（`token-usage/core/token-usage.ts` と
// 同じ切り分け）と、**セッション1つにつき1行だけ書く係**（{@link ContextUsageRecorder}）。
// **実際に書くのは `src/server/context-usage/adapter/context-usage-log.ts`**、
// **いつ呼ぶか**（ターンが終わるたび）を決めるのは `src/server/session/core/session-manager.ts`。
//
// **この係は駆動の世代をまたいで持つ** — 続きから起こして同じセッションIDになったときは同じ
// セッションなので、2行目を書かない（`session-manager.ts` の世代の持ち物には入れない）。
//
// **数と名前しか通らない。** 会話の文面・ツールの引数と結果は {@link ContextUsageEntry} に口が
// 無く、書いてよいものの線は `src/shared/context-usage-record.ts` が引いている
// （`docs/coding-standards.md`「会話内容の扱い」）。

import {
  type ContextUsage,
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../shared/context-usage.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import { type TokenUsageMode } from "../../../shared/token-usage.ts"
import { type SessionDriver } from "../../session-driver/core/session-driver.ts"

/**
 * 1セッションぶんの記録（**書き出す行そのものではない**）。`at` はエポックミリ秒で、
 * ISO 8601 への変換と日付ごとのファイルの選択は `adapter` 側の仕事（`TokenUsageEntry` と
 * 同じ切り分け）。
 */
export type ContextUsageEntry = {
  readonly at: number
  /** claude 側のセッションID。**同じIDで二度渡さない**のは呼ぶ側の責任。 */
  readonly sessionId: string
  readonly mode: TokenUsageMode
  readonly usage: ContextUsage
}

/**
 * コンテキストの内訳の書き込み口。**読み口は持たない** — この記録を読むのは tsukumo の外
 * （過去にさかのぼる分析）で、プロセスの中で読み戻す相手がいない。
 *
 * 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
 * `docs/coding-standards.md`「エラーハンドリング」）ので、受け付けたかどうかは返さない。
 */
export type ContextUsageLog = {
  readonly append: (entry: ContextUsageEntry) => void
}

/**
 * そのセッションのコンテキストの内訳を記録に残す係（**セッション1つにつき1回だけ**）。
 * ターンごとに残さないのは、内訳のうちメッセージ以外がセッションの中でほぼ変わらないから
 * （`src/shared/context-usage-record.ts`）。
 */
export type ContextUsageRecorder = {
  /**
   * **ターンが終わるたびに呼ばれ、まだ書いていないセッションIDのときだけ問い合わせる。**
   * 取れなかったら印を戻して**次のターンでまた試す**（諦めない——1回の取りこぼしでその
   * セッションぶんが永久に欠けるのに対し、あとのターンで取ってもほぼ同じ値になる）。
   * 問い合わせは待たされる口なので、**先に印を立てて二重に走らせない**（同じセッションで
   * 次のターンが先に終わっても、問い合わせは1本だけ）。
   *
   * **claude 側のセッションIDが分からないうちは何もしない**（行だけで「どのセッションか」が
   * 決まらない記録を積まないため。次のターンで揃う）。駆動がまだ無いときに呼ばないのは
   * 呼ぶ側の仕事。
   */
  readonly recordOnce: (state: SessionState, at: number, driver: SessionDriver) => Promise<void>
}

/** {@link ContextUsageRecorder} を1つ起こす（**世代をまたいで持ち回る**）。 */
export function createContextUsageRecorder(log: ContextUsageLog): ContextUsageRecorder {
  // 内訳を記録に残した claude 側のセッションID。**このIDのあいだは二度と書かない**
  // （1行 = 1セッション）。IDが変われば比較で弾かれる。
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
 * 起き上がっている駆動に、いまのコンテキストの内訳を問い合わせる。**投げてきた回は「取れない」に
 * 畳む**（常駐プロセスは落とさない）。
 *
 * `SessionManager.readContextUsage` のほうは**駆動が起き上がるのを待つところ**から面倒を見るので、
 * こちらとは畳む範囲が違う（記録を残す側は、起き上がっている駆動しか相手にしない）。
 */
async function readDriverContextUsage(driver: SessionDriver): Promise<ContextUsageReport> {
  try {
    return await driver.readContextUsage()
  } catch {
    return UNAVAILABLE_CONTEXT_USAGE
  }
}
