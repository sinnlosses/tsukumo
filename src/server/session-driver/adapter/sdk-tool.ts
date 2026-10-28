// tsukumo がプロセス内の MCP サーバとして提供するツール。
// `speak`、雑談のときの `remember` / `forget`、仕事のときの `report` / `work_plan` / `phase_result` / `question_brief` / `report_part_card`。
// `diary` と `usage_review_*` はここには載らない（どちらも会話とは別の使い捨ての問い合わせ。`queryDiary` / `queryUsageReview`）。
//
// サーバの名前とツールの名前は `TSUKUMO_MCP_SERVER_NAME` と `*_TOOL_NAME` が持つ。

import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { QuestionBrief } from "../../../shared/session-driver/question-brief.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { TSUKUMO_MCP_SERVER_NAME } from "../../core/tsukumo-tool-name.ts"
import type { CallReview } from "../core/call-review.ts"
import type { SessionMode } from "../core/session-driver.ts"
import { forgetTool, rememberTool } from "./sdk-memory-tool.ts"
import { partCardTool } from "./sdk-part-card-tool.ts"
import { reportTool } from "./sdk-report-tool.ts"
import { speakTool } from "./sdk-speech-tool.ts"
import { phaseResultTool, questionBriefTool, workPlanTool } from "./sdk-work-tool.ts"

/**
 * プロセス内の MCP サーバ。
 * 戻り値は既定が "ok" だけで、tsukumo の内部の状態や画面の事情がモデルへ戻る経路を作らない（`docs/architecture/adr/0009-speech-via-tool.md`）。
 * 例外は `speak`（仕事のときだけ）と `report` と `work_plan` と `phase_result` と `question_brief` と `report_part_card` と `remember` / `forget`。
 * `remember` / `forget` が返すのは、書けなかった・消せなかった理由の固定の文面だけ（`rememberReply` / `forgetReply`）。
 * `remember` は `allowsRemember` が偽のあいだ口を呼ばずに断る（外部由来の印）。
 * `phase_result` が返すのは、帯の今の段（帯を動かさなかったらそのこと）か、形の崩れの直し方だけ。
 * `speak` が返すのは、新しい事実の無い呼び出しと範囲の外の `phase` を差し戻す固定の文面だけ。
 * `report` が返すのは差し戻すときの規約違反だけ、`work_plan` が返すのは `CallReview` が受け付けなかったときの直し方だけ。
 *
 * 常に載るのは `speak` で、`remember` / `forget` は雑談モードのときだけ載る。
 * 仕事のときに `remember` / `forget` を出すと、作業の文脈が人格に入り込む経路になる。
 *
 * `report` は仕事のときだけ載る（仕事ではレポートを常にこれで受け取る。雑談は本文を書かない決まりなので載せない）。
 * `work_plan` も仕事のときだけ。
 * `phase_result` も仕事のときだけで、帯を動かす口は変換ではなく handler（帯を動かしたら `delegate-returned` を流す）。
 * 変換は委譲先の呼び出しから、次の返却に `phase_result` が伴った印だけを作る。
 * `question_brief` も仕事のときだけで、返すのは崩れた添え書きの直し方だけ。受け付けた添え書きは `holdBrief` に預ける。
 * `report_part_card` も仕事のときだけで、返すのは部品の文法カード（JSON Schema と例）か、引ける名前の一覧だけ。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す（`toSessionEvents`）。
 * 受け取り口を1つにしておくと、イベントの流れが1本で済む。
 * `report` と `work_plan` の引数も同じで、handler が引数を読むのは差し戻すかと返す文を決めるためだけ。
 * 差し戻した `report` の記録（`report-rejected`）は handler ではなく `CallReview.pass` が `isError` の結果を見て作る。
 */
export function tsukumoServer(
  expressions: readonly ExpressionChoice[],
  mode: SessionMode,
  callReview: CallReview,
  onReportTitle: (title: string) => void,
  cwd: string,
  onEvent: (event: SessionEvent) => void,
  holdBrief: (briefs: readonly QuestionBrief[]) => void,
  allowsRemember: () => boolean,
) {
  return createSdkMcpServer({
    name: TSUKUMO_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      speakTool(expressions, mode, callReview),
      ...(mode.kind === "work"
        ? [
            reportTool(expressions, callReview, onReportTitle, cwd, mode.figurePreference),
            workPlanTool(callReview),
            phaseResultTool(callReview, onEvent),
            questionBriefTool(holdBrief),
            partCardTool(),
          ]
        : []),
      ...(mode.kind === "chat"
        ? [rememberTool(mode.personaMemory, allowsRemember), forgetTool(mode.personaMemory)]
        : []),
    ],
  })
}
