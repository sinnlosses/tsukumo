// セッションの記録（`SessionRecord`）と、記録が持つ時刻・ツールの進みの型。記録の窓と、記録に入れる失敗の出力の長さの上限もここ。

import type { Expression } from "../character-pack/expression.ts"
import type { ReactionKind } from "../recommendation/reaction.ts"
import type { KeyFigures } from "../report/report-block-comparison.ts"
import type { RecordedReportFigure, ReportSection } from "../report/report-block.ts"
import type { ReportChangeSummary } from "../report/report-change-summary.ts"
import type { ReportCheck } from "../report/report-check.ts"
import type { ReportImageSize } from "../report/report-image.ts"
import type { ReportRetrospective } from "../report/report-retrospective.ts"
import type { ReportTask } from "../report/report-task.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import type { Question, QuestionAnswer } from "../session-driver/question.ts"
import type { TurnFailure } from "../session-driver/turn-failure.ts"
import type { ClippedText } from "../utils/clip-text.ts"
import type { ReportWaitingLine } from "./session-event-report.ts"
import type { WorkPlan, WorkPlanClosing } from "./work-plan.ts"

/**
 * メインビューに残す記録の窓（直近何ターンぶんを持ち続けるか）。常駐プロセスが動き続ける以上、記録自体も無限に増やさない。
 * `work` は `MAX_MAIN_VIEW_TURNS` の導出元。
 * 雑談の1ターンはセリフ1〜2件で軽く、仕事と同じ往復数では会話として短すぎるため、雑談だけ多く持つ。
 */
export const MAX_SESSION_STATE_TURNS = {
  work: 20,
  chat: 100,
} satisfies Record<"work" | "chat", number>

/** 依頼の手順で読めるツールの文面の上限（字数）。記録に入れる失敗の出力も、画面の切り詰めもこれで切る。 */
export const MAX_TOOL_TEXT_LENGTH = 8000

/**
 * ツールの実行がどこまで進んだか。結果が届くまでは `running` で、届いたら `finished` に
 * 結果を持つ（結果の無い `finished` も、結果のある `running` も起きない）。
 * 成功した結果の本文は持たない。失敗した出力は先頭 {@link MAX_TOOL_TEXT_LENGTH} 字と落とした字数だけ持つ。
 */
export type ToolRunStatus =
  | { readonly kind: "running" }
  | {
      readonly kind: "finished"
      /** 終わった時刻（{@link RecordTime}）。復元で読み戻したときの扱いはそちらを参照。 */
      readonly finishedAt: RecordTime
      readonly result:
        | { readonly kind: "succeeded" }
        | { readonly kind: "failed"; readonly output: ClippedText }
    }

/**
 * 背景で走らせた Bash（`run_in_background` が true）が走り終えたか。
 * その tool_result は起動を受け付けた時点で届くので、走り終えた時刻は `background-tool-finished` が届いた時刻にする。
 *
 * - `foreground`: 背景で走らせていない
 * - `awaiting`: 完了の知らせがまだ届いていない
 * - `notified`: 完了の知らせが届いた。`at` はその時刻
 */
export type BackgroundEnd =
  | { readonly kind: "foreground" }
  | { readonly kind: "awaiting" }
  | { readonly kind: "notified"; readonly at: RecordTime }

/**
 * 記録が起きた時刻。雑談のログが行ごとの時刻と日の区切りに、最終レポートが段ごとの所要時間に使う。
 *
 * - `stamped`: 起きた時刻が分かっている。`at` はそのイベントに打たれた時刻（`StampedEvent.at`。
 *   エポックミリ秒）
 * - `recovered`: 前のセッションの記録を組み直したもので、起きた時刻は transcript から戻せた。`at` はその時刻
 * - `restored`: 前のセッションの記録を組み直したもので、起きた時刻が分からない（transcript の行に時刻が無い・読めない）。
 *   流し直した時刻を代わりに入れると、昨日の一言が「いま」に見える
 */
export type RecordTime =
  | { readonly kind: "stamped"; readonly at: number }
  | { readonly kind: "recovered"; readonly at: number }
  | { readonly kind: "restored" }

export function recordTimeAt(time: RecordTime): number | undefined {
  return time.kind === "restored" ? undefined : time.at
}

/**
 * セッションの中で起きたことを起きた順に並べたもの。
 * ツールは `toolUseId` を持つ（あとから届く結果を突き合わせるため。表示には使わない）。
 * `speech` はメインビューには出さない（セリフは吹き出しだけに出す）が、過去のターンの吹き出しを引き直せるように記録には残す。
 */
export type SessionRecord =
  /**
   * 利用者の依頼。`images` は添えた画像の控えと、棚の原寸を指す id の組。
   * 原寸は記録に入らない（`hello` に載せない）。拡大して見るときは id で棚から取りに行く（`promptImagePath`）。
   *
   * `turnId` はそのターンの通し番号（`SessionState.nextTurnId`）。
   * 窓から古い記録が落ちても番号は振り直されないので、同じターンはセッションが続くかぎり同じ番号になる。
   */
  | {
      readonly kind: "request"
      readonly turnId: number
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
      readonly time: RecordTime
    }
  /**
   * バックグラウンドタスクが残っているあいだに送った言葉（脇の話）。`request` ではないのでターンの境目にならず、親のやり取りの中に積まれる。
   * 答えは、後ろに続く `answersAside` の `speech` の記録。
   */
  | {
      readonly kind: "aside"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
      readonly time: RecordTime
    }
  | { readonly kind: "detail"; readonly markdown: string }
  /**
   * `report` ツールで受け取ったレポート。引数をそのまま持ち、1つの本文に組むのはメインビューの導出。
   * 本文（`detail`）とは別の種類にしてあるのは、このレポートがあるターンでは本文を出さないという判定に、どちらから来たかが要るため。
   * `toolUseId` は `image` の塊の画像を棚から引く鍵（`reportImagePath`）。
   * `waitingLine` はメインビューには描かず、依頼を待つ間の吹き出しが読む（`shownReaction`）。
   */
  | {
      readonly kind: "report"
      readonly toolUseId: string
      readonly conclusion: string
      readonly keyFigures: KeyFigures
      readonly figure: RecordedReportFigure
      readonly sections: readonly ReportSection[]
      readonly favor: string
      readonly retrospective: ReportRetrospective
      readonly checks: readonly ReportCheck[]
      readonly task: ReportTask
      /** `report` が渡した段の閉じ方。段ごとの所要時間で、後の段を呼ばなかった段を「未着手」と見分ける。 */
      readonly workPlanClosing: WorkPlanClosing
      readonly waitingLine: ReportWaitingLine
      /** 変更の札。積んだときは `none` で、同じ `toolUseId` の `report-change-summary` が届いたら数に差し替わる。 */
      readonly changeSummary: ReportChangeSummary
      /** サーバが棚に置いたときに測れた画像の寸法。続きから復元した記録では、棚に置き直したときに埋まる。 */
      readonly imageSizes: readonly ReportImageSize[]
      /** サーバが棚に置けなかった・寸法を測れなかった画像のパス。描く側は最初から「出せない」の札にする。復元では置き直したときに埋まる。 */
      readonly unshelvedImages: readonly string[]
      /** 受け付けた時刻。最後の段の所要時間を閉じる端になる。 */
      readonly time: RecordTime
    }
  /**
   * `work_plan` ツールで受け取ったワークプランと、`finished` の `report` で tsukumo が閉じたワークプラン。
   * 届いた位置に積むだけで、今のワークプランは `currentWorkPlan`、手順ごとの段は `currentTurnSteps` が記録から導く。
   */
  | ({
      readonly kind: "work-plan"
      /** 積んだ時刻。 */
      readonly time: RecordTime
    } & WorkPlan)
  /**
   * 答え終わった質問（`question-answered`）。積むのは答えが確定した1回だけで、あとから書き換えない。
   * 形は `MainViewEntry` の `question` と同じに揃える（メインビューはそのまま通す）。
   */
  | {
      readonly kind: "question"
      readonly toolUseId: string
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | {
      readonly kind: "speech"
      readonly text: string
      readonly expression: Expression
      readonly time: RecordTime
      /** 脇の話のターン（`SessionState.sdkTurn` の `answeringAside`）で呼ばれた、脇の話への答えか。 */
      readonly answersAside: boolean
    }
  /**
   * 吹き出しに出し始めた反応（`ShownReaction`）の1行。`time` は出し始めた時刻。
   * セリフのログだけが拾い、メインビュー・雑談のログ・会話のアーカイブは拾わない。
   */
  | {
      readonly kind: "reaction"
      readonly reaction: ReactionKind
      readonly text: string
      readonly expression: Expression
      readonly time: RecordTime
    }
  | {
      readonly kind: "tool"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      readonly nested: boolean
      /** 始まった時刻（{@link RecordTime}）。所要時間は帯の「依頼の手順」が導く。 */
      readonly startedAt: RecordTime
      readonly status: ToolRunStatus
      readonly backgroundEnd: BackgroundEnd
    }
  /**
   * 圧縮の区切り（`compact-boundary`）。中身を持たない（画面に出すのは細い線1本だけで、文言も数値も添えない）。
   * `trimToRecentTurns` の数え方（`request` の数）は変えない（他の記録と同じく、窓から外れれば一緒に落ちる）。
   */
  | { readonly kind: "compact-boundary" }
  /**
   * 失敗で終わったターンの理由（`turn-finished` の `outcome` が `failed`）。そのターンの記録の末尾に1つだけ積む。
   * メインビューがターンの末尾に「失敗で終わった」と理由を出すので、過去のターンを遡っても成功と見分けられる。
   * 雑談のログ・依頼の手順・吹き出しは拾わない。
   */
  | { readonly kind: "turn-failure"; readonly failure: TurnFailure }
