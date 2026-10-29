// メインビューのやり取り（ターン）ごとの本文の選び方と、最終レポートなどの印の立て方。
// セッションの状態から導くだけで、別の状態は持たない。

import { sum } from "remeda"

import { NO_REPORT_CHANGE_SUMMARY } from "../../../shared/report/report-change-summary.ts"
import {
  type MainViewDraft,
  type MainViewEntry,
  type MainViewStep,
  type MainViewTurn,
  NO_BODY,
} from "../../../shared/session/main-view-shape.ts"
import { MAX_SESSION_STATE_TURNS } from "../../../shared/session/session-record.ts"
import type { ReportDrafting, TurnBodies } from "../../../shared/session/turn-progress.ts"
import { mainViewDraftOf } from "./a2ui-draft-view.ts"
import { finalReportBody, reportDrawsAnything } from "./main-view-report-body.ts"
import { groupIntoTurns } from "./main-view-step.ts"

/**
 * 出すやり取りの数。
 * 値は {@link MAX_SESSION_STATE_TURNS}.work から導く（メインビューの窓が記録の窓を超えない関係を導出で保つ。別々の定数にすると、どちらかだけを直したときに関係が黙って崩れる）。
 */
const MAX_MAIN_VIEW_TURNS = MAX_SESSION_STATE_TURNS.work

/**
 * 1つのやり取りの中で画面に出す記録の上限。超えた分は古いほうから落とし、件数だけを残す（やり取りの境界を優先する）。
 *
 * 数えるのは実際に画面へ出るもの（レポート・質問の記録）だけ（{@link shownEntryCount}）。
 * 画面に出るものだけを数えると1つのやり取りの最大は6件（中位数1・p99で4件。実測）で、この値には当たらない。
 * 落とすための値ではなく、1つのやり取りが際限なく伸びたときの止め。
 */
const MAX_MAIN_VIEW_ENTRIES = 40

/**
 * 時系列の記録を、やり取り（ターン）ごとにまとめ、直近 {@link MAX_MAIN_VIEW_TURNS} 件へ絞る。昇順（古い→新しい）で返す。
 *
 * `unsettled` はいちばん新しいやり取りで、まだ伸びうる本文の種類で、確定していない本文を出さないために要る（`report` を {@link selectToolReports} が、ツールの外の本文を {@link selectLastText} が見る）。
 * `SessionState.turn` が `running` かどうかそのものではない。
 * いま走っている SDK ターンで届いた本文だけが伸びうるもので、前の SDK ターンで届いた本文は、バックグラウンドタスクの通知などで claude が同じやり取りの続きを始めても確定したまま
 * （`report` の外の本文は例外で、続きが来うるあいだは伸びうる側に数える）。
 *
 * `closed` はセッション全体が閉じているか（ターンが `running` でなく、バックグラウンドタスクも残っていない）。
 * いちばん新しいやり取りにだけ渡す（それより前のやり取りは、次の依頼が始まった時点で既に閉じている）。
 * `unsettled` は「まだ伸びる本文をそもそも出すか」、`closed` は「出した本文に最終レポートの札を立ててよいか」で、独立に false になりうる
 * （背景の仕事を待って `turn-finished` が届くと `unsettled.report` は確定扱いに変わるが、バックグラウンドタスクが残っているあいだは `closed` は false のまま）。
 *
 * 伏せた `report` は、ステップに出るまでのあいだ草稿（`MainViewTurn.drafts`）として描き続ける。
 */
export function mainViewTurns(
  entries: readonly MainViewEntry[],
  unsettled: TurnBodies,
  closed: boolean,
): readonly MainViewTurn[] {
  const turns = groupIntoTurns(entries).slice(-MAX_MAIN_VIEW_TURNS)
  return turns
    .map(({ turn, toolReportIds }, index) => {
      // 動いているのはいちばん新しいやり取りだけで、それ以外の本文はもう確定している。
      const latest = index === turns.length - 1
      const reportSettled = !latest || !unsettled.report
      const selected =
        toolReportIds.length === 0
          ? selectLastText(turn, !latest || !unsettled.utterance)
          : selectToolReports(turn, toolReportIds, reportSettled)
      const drafts =
        toolReportIds.length === 0 || reportSettled ? [] : heldReportDrafts(turn, toolReportIds)
      return { turn: { ...markSupersededSteps(selected), drafts }, closed: !latest || closed }
    })
    .map(({ turn, closed: turnClosed }) => markFinalReport(turn, turnClosed))
    .map((turn) => limitTurnEntries(turn))
}

/**
 * いちばん新しいやり取りの草稿の後ろに、いま書いている `report` の草稿（`SessionState.sdkTurn` の `reportDrafting`）を足す。
 * 同じ `toolUseId` の草稿が既にあれば足さない。根が届いていなければ何も足さない。
 */
export function withReportDrafting(
  turns: readonly MainViewTurn[],
  drafting: ReportDrafting,
): readonly MainViewTurn[] {
  const latest = turns.at(-1)
  if (
    latest === undefined ||
    drafting.kind !== "drafting" ||
    latest.drafts.some((draft) => draft.toolUseId === drafting.toolUseId)
  ) {
    return turns
  }
  const draft = mainViewDraftOf(drafting.toolUseId, drafting.components)
  return draft === undefined
    ? turns
    : [...turns.slice(0, -1), { ...latest, drafts: [...latest.drafts, draft] }]
}

/**
 * `report` ツールが1回も呼ばれなかったやり取りの本文を選ぶ。
 * 出すのは最後の本文（空白だけのものは除く）1つだけで、それが最終レポートになる。
 * それより前の本文は、資料らしい形をしていても出さない（中間レポートは `report` ツールと段のまとめからしか生まれない）。
 * 段のまとめ（{@link isDecidedStep}）はそのまま出す。
 *
 * `settled` でないあいだは何も出さない。
 * 書きかけは最後のステップへ積まれるので、最後の本文はまだ伸びる途中か、次の本文に席を譲るかもしれない。
 * 出してから変わると、書き上げる演出（マウントした時点でしか始まらない）が確定した本文に掛からない。
 */
function selectLastText(turn: MainViewTurn, settled: boolean): MainViewTurn {
  const lastId = settled
    ? turn.steps.findLast(
        (step) =>
          !step.interim && step.body.kind === "text" && reportDrawsAnything(step.body.report),
      )?.id
    : undefined
  return {
    ...turn,
    steps: turn.steps.map((step) =>
      step.id === lastId || isDecidedStep(step) ? step : { ...step, body: NO_BODY },
    ),
  }
}

/**
 * 選ぶ前から出し方が決まっているステップ（本文が無いか、段のまとめ）。
 * 段のまとめは届いた時点で中間レポートと決まるので、ターンが動いているあいだも伏せず、最後の本文・最後の `report` の候補にもしない。
 */
function isDecidedStep(step: MainViewStep): boolean {
  return step.body.kind === "none" || step.interim
}

/**
 * `report` ツールが呼ばれたやり取りの本文を選ぶ。
 * 出すのは `report` から来たステップと段のまとめ（{@link isDecidedStep}）だけで、ツールの外に書いた本文は1つも出さない（推測の {@link selectLastText} は通さない）。
 * 最後の呼び出しが最終レポート、それより前は中間レポートで、あとに作業が続いたかどうかは見ない。
 *
 * `settled` でないあいだ、いちばん新しい `report` は出さない（次の `report` が来れば中間レポートに、来なければ最終レポートになるので、まだ決まっていない）。
 * 先に出すと、あとから中間へ変わったときに囲いが反転し、最終へ残ったときも書き上げる演出（マウントした時点でしか始まらない）が掛からない。
 */
function selectToolReports(
  turn: MainViewTurn,
  toolReportIds: readonly number[],
  settled: boolean,
): MainViewTurn {
  const lastId = toolReportIds.at(-1)
  return {
    ...turn,
    steps: turn.steps.map((step) => {
      if (!toolReportIds.includes(step.id)) {
        return isDecidedStep(step) ? step : { ...step, body: NO_BODY }
      }
      if (step.id !== lastId) {
        return { ...step, interim: true }
      }
      return settled ? step : { ...step, body: NO_BODY }
    }),
  }
}

/**
 * {@link selectToolReports} が確定していないとして伏せた最後の `report` を、草稿として描き続ける値。
 * 部品の一覧で描く本文（`a2ui` が `surface`）だけが草稿になる。
 */
function heldReportDrafts(
  turn: MainViewTurn,
  toolReportIds: readonly number[],
): readonly MainViewDraft[] {
  const held = turn.steps.find((step) => step.id === toolReportIds.at(-1))
  if (
    held?.origin.kind !== "tool-report" ||
    held.body.kind !== "text" ||
    held.body.report.kind !== "regions" ||
    held.body.report.a2ui.kind !== "surface"
  ) {
    return []
  }
  const draft = mainViewDraftOf(held.origin.toolUseId, held.body.report.a2ui.components)
  return draft === undefined ? [] : [draft]
}

/**
 * 各ステップに「自分より後ろに本文を持つステップがあるか」（`superseded`）を立てる。
 * `interim` の判定そのもの（{@link selectToolReports}）は変えず、ここで足すのは「畳むかどうか」の材料だけ。
 * 位置関係だけで決まる値なので、`interim` かどうかを問わず全ステップに立てる（畳む側で `interim` と組み合わせる）。
 */
function markSupersededSteps(turn: MainViewTurn): MainViewTurn {
  const { steps } = turn.steps.reduceRight<{
    steps: readonly MainViewStep[]
    followedByReport: boolean
  }>(
    (acc, step) => ({
      steps: [{ ...step, superseded: acc.followedByReport }, ...acc.steps],
      followedByReport: acc.followedByReport || step.body.kind === "text",
    }),
    { steps: [], followedByReport: false },
  )
  return { ...turn, steps }
}

/**
 * 最終レポート（そのやり取りで最後の、中間でない本文）に印を立て、同じやり取りに中間レポートがあるかどうかを畳む。
 * 引くのは1箇所だけにして、描く側が「最後の、中間でない本文」の条件を持たずに済むようにする。
 *
 * 2つに分かれているのは、箱とラベルで条件が違うため。
 * 最終レポートなら常に箱を外し、ラベル（「最終レポート」）は中間レポートのあるやり取りか、本文に `task` があるときだけ出す。
 *
 * 印を立てた本文は頭を最終のときの頭に替える（段ごとの所要時間を出すのは最終レポートだけ。{@link finalReportBody}）。
 * 変更の札は印を立てた `task` のある本文にだけ残し、ほかの本文では `none` に戻す。
 *
 * `closed` が false のとき（{@link mainViewTurns} の同名の引数）は `final` を1つも立てない。
 * やり取りがまだ閉じていないあいだは、次の `report` が来てこの本文が中間レポートへ回るかもしれないので、確定していないものに最終レポートの札（ラベルも箱を外すことも）を立てない。
 * `hasInterimReport` は `closed` に関係なく `interim` の集計のまま。
 *
 * `interim` の判定（{@link selectToolReports}）も `superseded`（{@link markSupersededSteps}）も変えない。
 */
function markFinalReport(turn: MainViewTurn, closed: boolean): MainViewTurn {
  const finalId = closed
    ? turn.steps.findLast((step) => step.body.kind === "text" && !step.interim)?.id
    : undefined
  return {
    ...turn,
    steps: turn.steps.map((step) => {
      if (step.body.kind === "none") {
        return { ...step, final: false }
      }
      if (step.id !== finalId) {
        return {
          ...step,
          body: { ...step.body, changeSummary: NO_REPORT_CHANGE_SUMMARY },
          final: false,
        }
      }
      const changeSummary =
        step.body.task.kind === "task" ? step.body.changeSummary : NO_REPORT_CHANGE_SUMMARY
      return {
        ...step,
        body: { ...step.body, report: finalReportBody(step.body.report), changeSummary },
        final: true,
      }
    }),
    hasInterimReport: turn.steps.some((step) => step.interim),
  }
}

/**
 * 1つのやり取りが画面に出す記録を上限まで切り詰める。落とすのは古いほう（今回の続きを残す）。
 * 数えるのは画面に出るものだけなので、ツールを何十件呼んでも落ちない（{@link MAX_MAIN_VIEW_ENTRIES}）。
 */
function limitTurnEntries(turn: MainViewTurn): MainViewTurn {
  const counts = turn.steps.map(shownEntryCount)
  const total = sum(counts)
  if (total <= MAX_MAIN_VIEW_ENTRIES) {
    return turn
  }

  const kept: MainViewStep[] = []
  let remaining = MAX_MAIN_VIEW_ENTRIES
  for (const [index, step] of turn.steps.toReversed().entries()) {
    const count = counts[counts.length - 1 - index] ?? 0
    if (count > remaining) {
      break
    }
    kept.unshift(step)
    remaining -= count
  }

  return { ...turn, steps: kept, droppedCount: total - (MAX_MAIN_VIEW_ENTRIES - remaining) }
}

/**
 * そのステップが画面に出す記録の件数。
 * 描く側が描くもの（レポート・質問の記録・脇の話）だけを数え、ツールの実行は数えない（メインビューに出ないため）。
 * 描く側が出すものを変えたら、ここも揃える。
 */
function shownEntryCount(step: MainViewStep): number {
  return (
    (step.body.kind === "none" ? 0 : 1) +
    step.actions.filter((action) => action.kind === "question").length +
    step.asides.length
  )
}
