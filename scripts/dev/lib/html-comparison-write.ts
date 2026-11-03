// HTML 版とレポート版を同じ題材・同じ書き手に書かせる見比べの、依頼の文・判定・疑似セッションの組み立て。
// 外のプロセスを起こさない純粋な部分だけを持つ。題材はすべて架空のものだけを受ける。

import { z } from "zod"

import { REPORT_NOTATION_PROMPT } from "../../../src/server/report/core/prompt/report-notation.ts"
import {
  REPORT_A2UI_COMPONENTS_DESCRIPTION,
  REPORT_TOOL_DESCRIPTION,
} from "../../../src/server/report/core/prompt/report-tool.ts"
import {
  reportRejectionText,
  reportViolations,
} from "../../../src/server/report/core/rules/index.ts"
import { REPORT_REJECTION_MODES } from "../../../src/server/report/core/rules/rejection-mode.ts"
import { reportEvents } from "../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { EXPRESSIONS } from "../../../src/shared/character-pack/expression.ts"
import { buildReportCatalogDocument } from "../../../src/shared/report/a2ui-report-catalog.ts"
import { extractComponents, judgeOutput } from "./a2ui-write-trial.ts"

export type ComparisonTopic = {
  readonly id: string
  readonly request: string
  readonly facts: string
}

/**
 * レポート版の判定。`schema` は Claude Code が引数の検査で返す差し戻しで、何度でも起きる。
 * `structure`・`violation` は tsukumo の差し戻しで、本番と同じく1回ずつしか差し戻さない（2回目は通して描く）。
 */
export type ReportJudgement =
  | { readonly kind: "accepted"; readonly components: readonly unknown[] }
  | {
      readonly kind: "rejected"
      readonly stage: RejectionStage
      readonly codes: readonly string[]
      readonly retryText: string
      readonly components: readonly unknown[] | undefined
    }

export type RejectionStage = "schema" | "structure" | "violation"

const topicSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  request: z.string().min(1),
  facts: z.string().min(1),
})

/** 題材のファイルの中身を読む。id が重なる・崩れた形なら投げる（起動時の前提不足）。 */
export function parseTopics(raw: unknown): readonly ComparisonTopic[] {
  const topics = z.array(topicSchema).min(1).parse(raw)
  const ids = topics.map((topic) => topic.id)
  if (new Set(ids).size !== ids.length) {
    throw new Error(`題材の id が重なっている: ${ids.join(", ")}`)
  }
  return topics
}

/** 両版に同じに渡す依頼の文。 */
export function writerRequest(topic: ComparisonTopic): string {
  return `${topic.request}\n\n${topic.facts}`
}

/** HTML 版の書き手に渡す system prompt。暗い面・外のネットワークなし・スクリプトなしでも読めることを固定する。 */
export function htmlSystemPrompt(): string {
  return [
    "あなたは作業の報告を、読み手に最も速く伝わる 1 枚の HTML として書く。見た目・配置・図・色は自由に決めてよい。",
    "条件: 1 つのファイルで完結させる（CSS と SVG は中に書く）。外のネットワーク（CDN・Web フォント・画像の URL）を読まない。",
    "暗い背景の画面の中で読まれるので、暗い地に明るい字で書く。スクリプトが止まっていても全部の内容が読めるようにする。",
    "本文は日本語で書く。材料に無い事実を足さない。",
    "出力は <!doctype html> から </html> までの HTML 1 つだけにする（説明文・コードフェンスは付けない）。",
  ].join("\n")
}

/** レポート版の書き手に渡す system prompt。本番の `report` のツールの説明・部品のカタログ・記法の節をそのまま渡す。 */
export function reportSystemPrompt(): string {
  return [
    "あなたは作業の報告を tsukumo の report ツールの components 引数として書く。出力は JSON の配列 1 つだけにする（説明文・コードフェンスは付けない）。",
    `report ツールの説明: ${REPORT_TOOL_DESCRIPTION}`,
    `components 引数の説明: ${REPORT_A2UI_COMPONENTS_DESCRIPTION}`,
    "規則: 根は id が root の Report。Report.children には Section の id だけを置く。Section の子に Section は置けない。配置の部品（Row・Column・Card・Tabs）の入れ子は 3 階層まで。参照されない部品・同じ id・参照先の無い id は置けない。",
    "使える部品は次のカタログに定義されたものだけ。",
    JSON.stringify(buildReportCatalogDocument()),
    REPORT_NOTATION_PROMPT,
  ].join("\n\n")
}

/** 書き手の出力から HTML を取り出す。コードフェンスや前後の説明は読み飛ばす。無ければ undefined。 */
export function extractHtml(text: string): string | undefined {
  const start = text.search(/<!doctype html|<html/iu)
  const closing = text.toLowerCase().lastIndexOf("</html>")
  return start < 0 || closing < start ? undefined : text.slice(start, closing + "</html>".length)
}

/**
 * 本番の `report` と同じ順で判定する: 引数の検査（部品ごとの形）→ 構造の検査 → 省けない欄 → 記法の条。
 * `spent` は、このターンですでに差し戻した tsukumo の段。使い切った段は通す。
 * 手続きの差し戻し（ワークプラン・背景のシェルなど）は、ターンの外の状態を読むので見ない。
 */
export function judgeReport(text: string, spent: ReadonlySet<RejectionStage>): ReportJudgement {
  const components = extractComponents(text)
  const shape = judgeOutput(text)
  const schemaFaults = shape.faults.filter((fault) => fault.source === "schema")
  if (components === undefined || schemaFaults.length > 0) {
    return {
      kind: "rejected",
      stage: "schema",
      codes: schemaFaults.map((fault) => fault.code),
      retryText: shape.retryText,
      components,
    }
  }
  const structureFaults = shape.faults.filter((fault) => fault.source === "structure")
  if (structureFaults.length > 0 && !spent.has("structure")) {
    return {
      kind: "rejected",
      stage: "structure",
      codes: structureFaults.map((fault) => fault.code),
      retryText: shape.retryText,
      components,
    }
  }
  const violation = violationOf(components)
  return violation === undefined || spent.has("violation")
    ? { kind: "accepted", components }
    : { kind: "rejected", stage: "violation", ...violation, components }
}

/** 撮影の道具に渡す疑似セッションの索引。同梱の索引の場面の並びだけを、見比べの場面に差し替える。 */
export function sessionIndexFor(baseIndex: unknown, sceneNames: readonly string[]): unknown {
  const base = z.looseObject({ turns: z.array(z.string()) }).parse(baseIndex)
  return { ...base, turns: [...sceneNames] }
}

/** 1つの題材のレポート版を描く場面。依頼 → `report` → 結果 → ターンの終わり。 */
export function reportScene(topic: ComparisonTopic, components: readonly unknown[]): unknown {
  const toolUseId = `fake-html-comparison-${topic.id}`
  return {
    name: topic.id,
    steps: [
      { afterMs: 0, event: { kind: "request", text: topic.request, images: [] } },
      { afterMs: 1500, event: { kind: "report", toolUseId, components } },
      {
        afterMs: 1550,
        event: { kind: "tool-finished", toolUseId, content: "ok", isError: false },
      },
      { afterMs: 2300, event: { kind: "turn-finished", outcome: { kind: "completed" } } },
    ],
  }
}

const REQUIRED_FIELDS = ["conclusion", "closing", "sessionRemaining"] as const

function violationOf(
  components: readonly unknown[],
): { readonly codes: readonly string[]; readonly retryText: string } | undefined {
  const report = reportEvents("html-comparison", { components }, EXPRESSIONS).find(
    (event) => event.kind === "report",
  )
  if (report === undefined) {
    return { codes: ["unreadable-conclusion"], retryText: "Report.conclusion が読めない" }
  }
  const missing = REQUIRED_FIELDS.filter(
    (field) => report.argumentChars.fields[field] === undefined,
  )
  if (missing.length > 0) {
    return {
      codes: missing.map((field) => `missing-${field}`),
      retryText: `Input validation error: 省けない欄が無い: ${missing.join(", ")}`,
    }
  }
  const rejecting = reportViolations({
    conclusion: report.conclusion,
    conclusionSentenceChars: report.conclusionSentenceChars,
    keyFigures: report.keyFigures,
    components: report.components,
    favor: report.favor,
    checks: report.checks,
    fileContents: new Map(),
    task: report.task,
    workPlanClosing: report.workPlanClosing,
  }).filter((violation) => REPORT_REJECTION_MODES[violation.kind] === "reject")
  return rejecting.length === 0
    ? undefined
    : {
        codes: [...new Set(rejecting.map((violation) => violation.kind))],
        retryText: reportRejectionText(rejecting),
      }
}
