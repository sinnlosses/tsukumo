// 機能ごとの組み立てが共有する、起動時に1回だけ決まる値。
// 2つ以上の組み立てが読むものだけを置き、1つの組み立てしか読まないものはその組み立ての中で作る。

import type { AchievementCache } from "../server/achievement/adapter/closed-issue.ts"
import type { ChatArchive } from "../server/chat/core/chat-archive-port.ts"
import type { BeadsStamp } from "../server/repository/adapter/beads.ts"
import type { FakeSession } from "../server/session-driver/adapter/fake-session.ts"

export type WiringDriver =
  | { readonly kind: "sdk" }
  | {
      readonly kind: "fake"
      readonly session: FakeSession
      /** 名指しする場面。未設定なら undefined ＝ 依頼を受けるまで `opening` だけ。 */
      readonly scene: string | undefined
      /** `scene` の手を流す個数の上限。undefined ＝ 全部流す。 */
      readonly sceneUntil: number | undefined
    }

export type WiringContext = {
  /** claude の作業先（tsukumo を起こしたディレクトリ）。 */
  readonly cwd: string
  /** サーバの時計（エポックミリ秒）。 */
  readonly now: () => number
  /** claude の子プロセスへ引き継ぐ環境変数（`Config.inheritedEnv`）。 */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /** 駆動の種類。`fake` は疑似セッションを持ち、claude を起こさない。 */
  readonly driver: WiringDriver
  /** 会話のアーカイブの口。書く側（セッションの管理）と読む側（起こすとき・定着）で1つを共有する。 */
  readonly chatArchive: ChatArchive
  /**
   * 成果の日記書きがその日の成果を数え直すための入れ物。
   * ビューの配信が持つものとは別の1つで、同じ日を両方から数えても結果は変わらない。
   */
  readonly achievementCache: AchievementCache
  /** `.beads` の有無と課題の変化の印の読み手。成果のキャッシュとタスク一覧の見張りで1つを共有する。 */
  readonly readBeadsStamp: () => Promise<BeadsStamp>
}
