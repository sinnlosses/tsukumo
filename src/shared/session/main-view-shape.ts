// メインビューに出す記録・ステップ・やり取りの形。
// 形だけを持ち、記録から導く判断は持たない。

import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import type { ReportChangeSummary } from "../report/report-change-summary.ts"
import type { LeafValue } from "../report/report-leaf-value.ts"
import type { ReportTask } from "../report/report-task.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import type { Question, QuestionAnswer } from "../session-driver/question.ts"
import type { TurnFailure } from "../session-driver/turn-failure.ts"
import type { MeasuredTime } from "../utils/elapsed-time.ts"
import type { ToolRunStatus } from "./session-record.ts"
import type { PhaseShift } from "./work-plan-shift.ts"

/**
 * メインビューに時系列で流す1件分の記録。
 * 描く側が読むだけの形で、ここが決めた結果を渡す（`mainViewEntries`）。
 */
export type MainViewEntry =
  | {
      readonly kind: "request"
      /** そのターンの通し番号（`SessionState.nextTurnId` が振ったもの）。 */
      readonly turnId: number
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * キャラクターからの質問（AskUserQuestion）と、それに対する答え。`answers[i]` は
   * `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}。選ばなかった質問は空）。
   * `toolUseId` は preview の画像の棚を引く鍵。
   */
  | {
      readonly kind: "question"
      readonly toolUseId: string
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | {
      readonly kind: "tool"
      readonly name: string
      readonly input: unknown
      readonly status: ToolRunStatus
    }
  | { readonly kind: "detail"; readonly markdown: string }
  /**
   * `report` ツールで受け取ったレポート。引数はここで欄に組んである（`reportRegionsOf`）。
   * `detail` と分けてあるのは、このレポートがあるやり取りでは本文（`detail`）を出さないため（`selectToolReports`）。
   * `task` は本文に組まず、描く側が目録の1行と見出しに出す。
   * `conclusion` は組む前の結論で、畳んだときの先頭行に使う（`groupIntoSteps`）。
   * `changeSummary` は記録の変更の札をそのまま通したもの。
   * `toolUseId` は `report` ツールの呼び出しの ID。
   */
  | {
      readonly kind: "report"
      readonly toolUseId: string
      readonly regions: MainViewReportRegions
      readonly conclusion: string
      readonly task: ReportTask
      readonly changeSummary: ReportChangeSummary
    }
  /**
   * `work_plan` の呼び出しで段が移ったこと（`phaseShiftOf`）。
   * 出すものが1つも無い記録からは作らない。
   * 終えた段のまとめは中間レポートになる（`groupIntoSteps`）。
   */
  | {
      readonly kind: "phase-shift"
      readonly shift: PhaseShift
      /** 終えた段の所要。記録の時刻から測れなければ `unknown`。 */
      readonly duration: MeasuredTime
    }
  /**
   * 失敗で終わったターンの理由（`SessionRecord` の `turn-failure` をそのまま通す）。
   * ステップには入れない（やり取りの末尾に1つだけ出す印なので、`groupIntoTurns` がステップから外して `MainViewTurn.failure` に移す）。
   */
  | { readonly kind: "turn-failure"; readonly failure: TurnFailure }
  /**
   * 脇の話と、それへの答えのセリフ（`answersAside` の `speech`）。
   * `groupIntoSteps` が対にして、届いた時点で最後のステップの `MainViewStep.asides` に移す。
   */
  | { readonly kind: "aside"; readonly text: string }
  | { readonly kind: "aside-answer"; readonly text: string }

/**
 * `report` ツールの本文の欄の並び。描く順の並びは `orderedReportRegions` が導く。
 * `head` は結論と合図の行、`finalHead` は最終レポートのときの頭で、`head` に段ごとの所要時間を足したもの。
 * `sections` は中身のある節だけを並べる。
 * `retrospective` は振り返りの塊の Markdown（無ければ空文字）。
 * `favor` はお願いの本文（無ければ空文字）と、合図の行の印が飛ぶ先の `id`。
 * `a2ui` は `a2ui` の版の部品の一覧を A2UI の面で描くための値（{@link MainViewA2uiReport}）。
 */
export type MainViewReportRegions = {
  readonly kind: "regions"
  readonly head: string
  readonly finalHead: string
  readonly sections: readonly MainViewReportSection[]
  readonly retrospective: string
  readonly favor: { readonly id: string; readonly markdown: string }
  readonly a2ui: MainViewA2uiReport
}

/**
 * 部品の一覧で描く本文の値。`none` は一覧の無い記録と、一覧と `sections` の写しが食い違う記録。
 * `sections` は根の子の部品の ID から、その子が写った節の欄の ID と見出しの行（`## …`。見出しの無い節は空文字）。整形で塊の残らない子は持たない。
 * `leaves` は葉の部品の ID から、その葉の Markdown（図表の番号と傍注は節の欄の Markdown と同じ。整形で落ちた葉は空文字）。
 * `leafValues` は葉の部品の ID から、その葉の図表番号・表の札の色・寄せられた傍注（{@link LeafValue}）。
 * `leaves` の葉に加えて `Report.figure` の葉と振り返りの葉も持ち、整形で落ちた葉は持たない。
 * `tables` は操作できる `Table` の ID から、その Markdown の行ごとの分け方。整形で落ちた表は持たない。
 */
export type MainViewA2uiReport =
  | { readonly kind: "none" }
  | {
      readonly kind: "surface"
      readonly components: readonly A2uiReportComponent[]
      readonly sections: Readonly<
        Record<string, { readonly regionId: number; readonly heading: string }>
      >
      readonly leaves: Readonly<Record<string, string>>
      readonly leafValues: Readonly<Record<string, LeafValue>>
      readonly tables: Readonly<Record<string, MainViewTableRows>>
    }

/**
 * 操作できる `Table`（`sortable`・`filterable`）の Markdown を、データ行の前後と行ごとに分けたもの。
 * `before + rows.join("\n") + after` が、その葉の Markdown と一致する。
 */
export type MainViewTableRows = {
  readonly before: string
  readonly rows: readonly string[]
  readonly after: string
}

/**
 * 節の欄。`id` は整形して図を先頭に足したあとの節の並びの位置。
 * `heading` は節の `heading` の字そのもの（前後の空白を除く。見出しの無い節は空文字）。
 */
export type MainViewReportSection = {
  readonly id: number
  readonly heading: string
  readonly markdown: string
}

/** メインビューの本文。`report` ツールの本文は欄の並びで、ほかの本文（`detail`・段のまとめ）は Markdown 1本の欄。 */
export type MainViewReportBody =
  | MainViewReportRegions
  | { readonly kind: "markdown"; readonly markdown: string }

/**
 * 描く順に並べた欄1つ（`orderedReportRegions`）。`markdown` は空でない。
 * 節の欄の `id` は {@link MainViewReportSection} の `id`、お願いの欄の `id` は合図の行の印が飛ぶ先。
 */
export type MainViewReportRegion =
  | { readonly kind: "head"; readonly markdown: string }
  | { readonly kind: "section"; readonly id: number; readonly markdown: string }
  | { readonly kind: "retrospective"; readonly markdown: string }
  | { readonly kind: "favor"; readonly id: string; readonly markdown: string }
  | { readonly kind: "markdown"; readonly markdown: string }

export type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
export type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
export type MainViewAction = MainViewToolRun | MainViewQuestion

/**
 * やり取りが失敗で終わったか（`MainViewTurn.failure`）。`failed` のときだけ、描く側がやり取りの末尾に「失敗で終わった」と理由を出す。
 * 1つのやり取りに失敗が2つ以上あれば（バックグラウンドタスクのあとの続きのターンも失敗したときなど）、いちばん新しいものを出す。
 */
export type MainViewTurnFailure =
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly failure: TurnFailure }

/**
 * 1ステップ＝レポート1件と、それに続く出来事。
 *
 * `body` は画面に出す本文（{@link MainViewStepBody}）。
 *
 * `interim` は、その本文が中間レポート（`report` ツールの最後でない呼び出し〔`selectToolReports`〕か、段のまとめ〔`groupIntoSteps`〕）かどうか。`body` が `none` のときは常に false。
 *
 * `superseded` は、自分より後ろに本文を持つステップがあるか（`markSupersededSteps`）。
 * `interim && superseded` のときだけ描く側が畳む。本文を持たないステップでも立つ。
 *
 * `final` は、その本文が最終レポート（そのやり取りで最後の、中間でない本文）かどうか（`markFinalReport`）。
 * 箱を外してラベルを載せる印（`.main-step.is-final`）で、書き上げる演出を掛ける相手を選ぶのにも使う。
 * ラベルを出すかどうかはこれだけでは決まらない（`MainViewTurn.hasInterimReport` と本文の `task` と組み合わせる）。
 * いちばん新しいやり取りでは、やり取りが閉じているときだけ立つ（`mainViewTurns` の `closed` 引数）。
 *
 * `id` は、そのやり取りの中で作られた順に先頭から数えた通し番号。
 * `limitTurnEntries` が上限を超えた分を古いほうから落としても、残ったステップの `id` は変わらない（`groupIntoSteps` で、落とす前に振る）。
 * 描く側はこれをステップの `key` に使う。
 * 配列の添字を `key` にすると、古いステップが落ちて添字が前へずれた瞬間に、React が別のステップの DOM を使い回す（`<details>` の `open` のような制御されていない DOM の状態が別のステップへ乗り移って見える）。
 */
export type MainViewStep = {
  readonly id: number
  readonly body: MainViewStepBody
  readonly origin: MainViewStepOrigin
  readonly interim: boolean
  readonly superseded: boolean
  readonly final: boolean
  readonly actions: readonly MainViewAction[]
  /** このステップの後ろに足す脇の話（古い順）。 */
  readonly asides: readonly MainViewAside[]
}

/**
 * ステップの本文がどこから来たか。`report` ツールから来たステップだけが、その呼び出しの ID を持つ。
 */
export type MainViewStepOrigin =
  | { readonly kind: "tool-report"; readonly toolUseId: string }
  | { readonly kind: "other" }

/** 段の見出しの字（「2/4 段の名前」）。無ければ `none`。 */
export type MainViewPhaseLabel =
  | { readonly kind: "none" }
  | {
      readonly kind: "phase"
      readonly label: string
      readonly duration: MeasuredTime
      readonly skipped: boolean
    }

/**
 * ステップの本文。本文が無い（レポートより前に起きたことをまとめたステップか、出さないと決めた本文）なら `none`。
 * `firstLine` は畳んだときの `<summary>` に出す1行で、段のまとめなら終えた段の見出し、`report` なら結論（空なら作業の名前）、どちらも無ければ本文の先頭行（`extractFirstLine`）。
 * `task` は目録の1行と見出しに出すタスクで、`report` ツールの外の本文では常に `none`。
 * `finishedPhase` は目録の1行に添える終えた段の見出しで、段のまとめだけが持つ。
 * `report` は最終レポートの印が立つと、頭を最終のときの頭に替える（`markFinalReport`）。
 * `changeSummary` は目録の末尾に出す変更の札。`task` のある最終レポートだけが数を持ち、ほかは `none`（`markFinalReport`）。
 */
export type MainViewStepBody =
  | { readonly kind: "none" }
  | {
      readonly kind: "text"
      readonly report: MainViewReportBody
      readonly firstLine: string
      readonly task: ReportTask
      readonly finishedPhase: MainViewPhaseLabel
      readonly changeSummary: ReportChangeSummary
    }

export const NO_BODY = { kind: "none" } as const satisfies MainViewStepBody

export type MainViewAside = {
  readonly text: string
  readonly answer:
    | { readonly kind: "waiting" }
    | { readonly kind: "answered"; readonly text: string }
}

/** やり取りの頭に出す依頼。文面と、添えた画像の控えで1つ。添えていなければ `images` は空。 */
export type MainViewRequest = {
  readonly text: string
  readonly images: readonly RecordedPromptImage[]
}

/**
 * 利用者の依頼1件と、それ以降のステップ。
 * `request` が undefined なのは、最初の依頼より前の記録（セッションの途中から追い始めたときに起こる）。
 * `id` は追加されても番号がずれないように先頭から数えた通し番号で、タブの選択を保つのに使う。
 */
export type MainViewTurn = {
  readonly id: number
  readonly request: MainViewRequest | undefined
  readonly steps: readonly MainViewStep[]
  /**
   * このやり取りに中間レポートが1つ以上あるか（`markFinalReport`）。
   * 最終レポートのラベルを出す条件の1つ（もう1つは本文の `task`）。本文が1つしか無く `task` も無いやり取りでは「最終」が何も区別しないので出さない。
   */
  readonly hasInterimReport: boolean
  /** 上限を超えて落とした画面に出す記録の件数。0 のときは何も落としていない。 */
  readonly droppedCount: number
  /** このやり取りが失敗で終わったか（{@link MainViewTurnFailure}）。 */
  readonly failure: MainViewTurnFailure
  /**
   * まだステップとして画面に出ていない `report` の草稿（{@link MainViewDraft}。届いた順）。
   * 目次の材料（`steps`）には入らない。いちばん新しいやり取りにだけ載る。
   */
  readonly drafts: readonly MainViewDraft[]
}

/**
 * `a2ui` の版の `report` の草稿1つ。書いている途中の引数か、届いたが確定するまで伏せている記録の部品から作る。
 * `components` は根から辿れる部品だけ。`regions` はそれを描く欄（図・合図の行・所要時間は持たない）。
 */
export type MainViewDraft = {
  readonly toolUseId: string
  readonly components: readonly A2uiReportComponent[]
  readonly regions: MainViewReportRegions
}

/** やり取りの脇の話を、届いた順に1本にしたもの。 */
export function turnAsides(turn: MainViewTurn): readonly MainViewAside[] {
  return turn.steps.flatMap((step) => step.asides)
}
