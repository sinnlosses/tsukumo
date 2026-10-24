// セッションの出来事（`SessionEvent`）のうち、`report` ツールの呼び出しに関するものの型。

import type { ReportArgumentChars, ReportArgumentField } from "../report/report-argument-chars.ts"
import type { RecordedReportFigure, ReportSection } from "../report/report-block.ts"
import type { ReportChangeCount } from "../report/report-change-summary.ts"
import type { ReportCheck } from "../report/report-check.ts"
import type { ReportImageSize } from "../report/report-image.ts"
import type { ReportRetrospective } from "../report/report-retrospective.ts"
import type { ReportTask } from "../report/report-task.ts"
import type { SessionRemaining } from "./session-digest.ts"
import type { SpeechEvent } from "./session-event-speech.ts"
import type { WorkPlanClosing } from "./work-plan.ts"

/**
 * `report` の締めのセリフ（`report` ツールの `closing` 引数）。`none` は `closing` を持たなかった
 * ころの呼び出しで、transcript から組み直したときにだけ現れる。
 */
export type ReportClosing = SpeechEvent | { readonly kind: "none" }

/** `report` の待ちの一言（`report` ツールの `waitingLine` 引数）。`none` は Claude Code が書かなかった。 */
export type ReportWaitingLine = SpeechEvent | { readonly kind: "none" }

/** `report` ツールの呼び出しと、それに付く記録・差し戻し・変更の量のイベント。 */
export type ReportEvent =
  /**
   * メインが `report` ツールの引数を書き始めた（`includePartialMessages` の断片で、呼び出しの塊が開いた合図）。
   * 立ち絵の「書いている」の材料で、同じ `toolUseId` の `report` か `tool-finished` が届くまで続く。中身（引数の断片）は運ばない。
   */
  | { readonly kind: "report-drafting"; readonly toolUseId: string }
  /**
   * `report` ツールの呼び出し。メインが呼んだものだけが届く（サブエージェントの呼び出しは変換で捨てる）。
   * `sections`（本文の節）と `checks`（検証結果）は無ければ空の配列、`favor` は無ければ空の文字列、`retrospective`（振り返りの結果）は無ければ `none`、`task` と `workPlanClosing`（段の閉じ方）は無ければ `none`。
   * `figure`（レポートの図1つか、置かない理由）は無ければ理由が `unrecorded` の `none`。
   * `toolUseId` は呼び出しの id で、差し戻しが同じ呼び出しの `tool-finished` と突き合わせるのに使う。
   * `closing`（締めのセリフ）は描いたあとに差し戻しが `speech` として出すもので、画面の状態はこの欄を読まない。
   * `waitingLine`（待ちの一言）は記録に写り、依頼を待つ間に `shownReaction` が出す。
   * `unknownBlockCount` は知らない種類で境界で落とした塊の数で、画面の状態は読まない。
   * `sessionSummary` はセッション全体の要約で、書かれていなければ undefined。レポートには描かず、切り替え画面が transcript から読み戻す。
   * `sessionRemaining`（残っていること）も同じく描かず、切り替え画面と始め方の一覧の「前回の続き」が transcript から読み戻す。
   * `argumentChars` は渡した引数だけの字数で、使われ方の記録だけが読む。
   * `inheritedFields` は渡さずに、同じターンで直前に差し戻した呼び出しから値を引き継いだ欄の名前（`ReportInheritance` が埋める）。使われ方の記録だけが読む。
   * `conclusion` を渡さず引き継ぐ土台も無い呼び出しは、`conclusion` が空の文字列になる。
   * `conclusionSentenceChars` は `conclusion` の要素ごとの字数で、記法の検査だけが読む。
   * `conclusionFirstSentence` は `conclusion` の1要素目で、通った `report` のツール結果の文になる。
   * `title`（セッション一覧の見出し）は書かれていなければ undefined。画面の状態は読まず、差し戻しのあとの出し直しで引き継ぐためだけに持つ（書き込むのは handler）。
   * `imageSizes` は `report` の引数ではなく、サーバが画像を棚に置いたときに測った寸法。駆動は空で渡し、セッションの管理が畳む前に埋める。
   */
  | {
      readonly kind: "report"
      readonly toolUseId: string
      readonly argumentChars: ReportArgumentChars
      readonly inheritedFields: readonly ReportArgumentField[]
      readonly conclusion: string
      readonly conclusionSentenceChars: readonly number[]
      readonly conclusionFirstSentence: string
      readonly figure: RecordedReportFigure
      readonly sections: readonly ReportSection[]
      readonly favor: string
      readonly retrospective: ReportRetrospective
      readonly checks: readonly ReportCheck[]
      readonly task: ReportTask
      readonly workPlanClosing: WorkPlanClosing
      readonly closing: ReportClosing
      readonly waitingLine: ReportWaitingLine
      readonly unknownBlockCount: number
      readonly title: string | undefined
      readonly sessionSummary: string | undefined
      readonly sessionRemaining: SessionRemaining
      readonly imageSizes: readonly ReportImageSize[]
    }
  /**
   * 引数が読めず（`conclusion` が文字列・文字列の配列・省略のどれでもない）`report` にならなかったメインの呼び出し。サーバの中だけで流れる。
   * `CallReview` が同じ `toolUseId` の `tool-finished` まで預かり、差し戻しの記録（`report-rejected`）にだけ使う（畳み込み・ブラウザには届かない）。
   */
  | {
      readonly kind: "report-malformed"
      readonly toolUseId: string
      readonly argumentChars: ReportArgumentChars
    }
  /**
   * 結果が `isError` で返った `report` の呼び出しごとに、`CallReview` が `tool-finished` の直後に作る（記録の口で、画面の状態は読まない）。
   * `reasons` は差し戻しの種類の名前だけで、本文も文面も持たない。判定が差し戻したものはその理由、形の検査で落ちたもの（handler に届かなかったものと、組んだ値が落ちたもの）は `tool-error`。
   * `argumentChars` は呼び出しの生の引数の字数で、`inheritedFields` は引き継いだ欄の名前（どちらも受理した `report` と同じ）。
   * 引数が読めなかった呼び出しの `inheritedFields` は空。
   */
  | {
      readonly kind: "report-rejected"
      readonly reasons: readonly string[]
      readonly argumentChars: ReportArgumentChars
      readonly inheritedFields: readonly ReportArgumentField[]
    }
  /**
   * `task` のある受理された `report` のあとに、依頼の頭の HEAD からの変更の量を tsukumo が git で数えて届ける。
   * `toolUseId` はその `report` の呼び出しの id。数えられなかったときは流れず、transcript からの復元でも流れない。
   */
  | ({
      readonly kind: "report-change-summary"
      readonly toolUseId: string
    } & ReportChangeCount)
