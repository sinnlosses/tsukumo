// セッションの出来事（`SessionEvent`）のうち、サイドバーと画面の周辺の状態（タスク・おすすめ・迎えの挨拶・キャラクター・セッション一覧・雑談・既定・圧縮）に関するものの型。

import type { CharacterInfo, CharacterPackEntry } from "../character-pack/character.ts"
import type { ItemInfo, ItemSeatMap } from "../item/item.ts"
import type { ReactionLine, WrittenReactions } from "../recommendation/reaction.ts"
import type { RecommendationCard } from "../recommendation/recommendation-card.ts"
import type { WelcomeGreetingState } from "../recommendation/welcome-greeting.ts"
import type { TaskSummaryChange } from "../repository/task-summary-change.ts"
import type { SessionChoice } from "./session-choice.ts"
import type { SessionDefault } from "./session-default.ts"

export type SurroundingEvent =
  /**
   * タスクの一覧が変わった（Beads の課題を見て起こす）。
   * 起こしてから最初の見回りで必ず1回届く。読めない・消えたときは `tasks: { kind: "unknown" }`（サイドバーの「不明」表示に対応する）。
   * 一覧は差分（{@link TaskSummaryChange}）で運び、全件は `hello` の `SessionState.tasks` が持つ。
   */
  | { readonly kind: "tasks-changed"; readonly tasks: TaskSummaryChange }
  /**
   * おすすめの札が変わった（タスク一覧が届いて候補が変わったとき。出し手はサーバの推薦役）。
   * 候補が前と同じなら流れない。空の並びは「まだ無い」で、候補が変わってキャッシュに無いときに一度流れ、問い合わせが通ればその結果がもう一度流れる。
   */
  | { readonly kind: "recommendation-changed"; readonly cards: readonly RecommendationCard[] }
  /**
   * 迎えの挨拶の状態が変わった（新しく起こした・続きから起こしたセッションと `/clear` のたび。出し手はサーバの `greetWelcome`）。
   * `writing` → `written` または `unwritten` の順に流れる。
   */
  | { readonly kind: "welcome-greeting-changed"; readonly state: WelcomeGreetingState }
  /**
   * 画面が迎えの挨拶を表示した、またはその文が札で変わった（出し手はコマンド `recordWelcomeGreeting`）。
   * `line` はいまの挨拶から組める文であることを、受けた側が確かめてから流す（`isWelcomeGreetingLine`）。
   */
  | { readonly kind: "welcome-greeting-shown"; readonly line: ReactionLine }
  /**
   * 反応の行が書けた（代を起こすたびに1回、書けたときだけ。`/clear` では流れない。出し手はサーバの迎えの書き手 `createWelcomeGreeter`）。
   */
  | { readonly kind: "reactions-written"; readonly reactions: WrittenReactions }
  /**
   * 待ちの一言を出す時刻（`waitingLineDueAt`）が来た。出し手はサーバの時計で、その時刻に1回流す。
   * 時刻が来た瞬間には他のイベントが来ないので、待ちの一言を記録に積む合図にする。
   */
  | { readonly kind: "waiting-line-due" }
  /**
   * キャラクターパックが決まった・一覧が変わった（起こしたとき・起こし直したときの1回ずつと、画面からパックを変えた・作ったとき）。
   * キャラビューが立ち絵を取りに行く先で、中身は URL だけ（素材そのものは乗らない）。
   *
   * 全パックぶんの一覧（`packs`。使用中以外のパックの姿も含む）も一緒に運ぶ。
   * 一覧が変わる契機はいま出しているパックが変わる契機と同じで、使用中の印（`inUse`）も持ち替えで動くので、イベントを分けない。
   */
  | ({ readonly kind: "character-changed" } & CharacterInfo & {
        readonly packs: readonly CharacterPackEntry[]
      })
  /**
   * 切り替え先として選べるセッションの一覧が分かった。
   * 駆動を起こすたび（起こし直しも）に流れる。
   * まずサーバがメモリに持っている一覧を流し、これは起こし直しの `hello` に入る。
   * transcript の一覧を読み直せたら、読み直した一覧をもう一度流し、これは `hello` より後に届く（`current` は同じ）。
   *
   * ターンのたびには流れない（印が付くのはターンが終わって少し後で、流すたびに transcript の一覧を読み直すことになる）。
   * 画面に出る最終更新時刻は起こした時点の姿。
   *
   * 中身は印から読めるものだけで、会話の内容は入らない。
   */
  | {
      readonly kind: "sessions-changed"
      readonly sessions: readonly SessionChoice[]
      /**
       * いま起こしたセッションのID（続きから始めなかったときは undefined ＝ 新規）。
       * `session-info` を待たずに「どれを出しているか」を言えるのはこの経路だけ（`init` は最初の依頼を送るまで届かない）。
       */
      readonly current: string | undefined
    }
  /**
   * 雑談モードに入っている／出ている。駆動を起こしたときと、`session.setChatMode` で起こし直したときの1回ずつ流れる。
   * 起こし直すと状態が初期値へ戻るので、このイベントが無いと画面は雑談中かどうかを見失う（`INITIAL_SESSION_STATE.chatMode` は `false`）。
   */
  | { readonly kind: "chat-mode-changed"; readonly chat: boolean }
  /**
   * 雑談のサイドバーの「最近の話題」に出す見出し（新しい順）。雑談で起こしたときと、定着があらすじを書き直したときに流れる。
   * 運ぶのは写しから取り出した見出しだけで、要約の本文は乗らない。取り出せなかった・写しがまだ無いときは空の並び。
   */
  | { readonly kind: "chat-topics-changed"; readonly topics: readonly string[] }
  /**
   * 定着が続けて失敗して、このプロセスの間は契機を起こさなくなった。止めた1回だけ流れる。
   * `failures` は止めるまでに続けて失敗した回数。
   */
  | { readonly kind: "chat-consolidation-halted"; readonly failures: number }
  /**
   * 雑談のサイドバーの「覚えていること」に出す一覧。
   * 雑談で起こしたときと、`remember` / `forget`（キャラクター自身）・画面の「編集」の `chat.forgetRememberedLine` のどれかで `persona.md` の `## 覚えたこと` が変わったときに流れる。
   *
   * 運ぶのは節の行そのもの（`- ` を外した文面、古い→新しいの順）。
   * 上限に当たった・一致する行が無かった・書けなかったときは流れない（変わらなかった回は知らせない）。
   */
  | { readonly kind: "remembered-lines-changed"; readonly lines: readonly string[] }
  /**
   * アイテムの一覧と、全パックの席が変わった（駆動を起こしたときと、一覧・席を変えるコマンドのあと）。
   * 口ごとの差分は配らず、そのつど丸ごと置き換える。`seats` の鍵はパックの名前で、空の席は undefined。
   */
  | {
      readonly kind: "items-changed"
      readonly items: readonly ItemInfo[]
      readonly seats: Readonly<Record<string, ItemSeatMap>>
    }
  /**
   * 新しいセッションの既定が分かった。駆動を起こしたときと、起こし直したときの1回ずつと、歯車から `session.setSessionDefault` で覚え直したときに流れる。
   * 運ぶのは覚えた値（読めなければ同梱の既定へ畳んだあとの値）で、いま動いているセッションの値ではない（そちらは `session-info` の `model` / `permissionMode`）。
   */
  | { readonly kind: "session-default-changed"; readonly sessionDefault: SessionDefault }
  /**
   * claude 自身の圧縮（`/compact`）が起きた（SDK の `system` / `compact_boundary`）。
   * 数値（`compact_metadata` の `pre_tokens` / `post_tokens` / `duration_ms`）は運ばない（画面に出さないものを契約に入れない）。
   * 画面に出すのは雑談のログの細い線1本だけで、文言は添えない。
   */
  | { readonly kind: "compact-boundary" }
