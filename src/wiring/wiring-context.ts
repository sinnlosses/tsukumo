// 機能ごとの組み立てが共有する、起動時に1回だけ決まる値。
// 2つ以上の組み立てが読むものだけを置き、1つの組み立てしか読まないものはその組み立ての中で作る。

import type { AchievementCommitCache } from "../server/achievement/adapter/main-history.ts"
import type { ChatArchive } from "../server/chat/core/chat-archive-port.ts"
import type { FakeSession } from "../server/session-driver/adapter/fake-driver.ts"

export type WiringContext = {
  /** claude の作業先（tsukumo を起こしたディレクトリ）。 */
  readonly cwd: string
  /** サーバの時計（エポックミリ秒）。 */
  readonly now: () => number
  /** claude の子プロセスへ引き継ぐ環境変数（`Config.inheritedEnv`）。 */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /** fake driver の疑似セッション。あるときは claude を起こさない。 */
  readonly fakeSession: FakeSession | undefined
  /** 会話のアーカイブの口。書く側（セッションの管理）と読む側（起こすとき・定着）で1つを共有する。 */
  readonly chatArchive: ChatArchive
  /**
   * 成果の振り返りと訪問の台本がその日の成果を数え直すための入れ物。
   * ビューの配信が持つものとは別の1つで、同じ日を両方から数えても結果は変わらない。
   */
  readonly achievementCommitCache: AchievementCommitCache
}
