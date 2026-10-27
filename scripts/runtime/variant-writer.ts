// 架空の依頼1本を、指定した `report` の版で本物の SDK の駆動に1回書かせる書き手。
// 会話の中身（依頼文・本文・セリフ）はログにも標準出力にも出さない。返すのは受け取った `report` のイベントと、差し戻しの理由の名前と秒数だけ。

import { mkdirSync, mkdtempSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import type { ReportSchemaVariant } from "../../src/server/core/schema-variant.ts"
import { startSdkDriver } from "../../src/server/session-driver/adapter/sdk-driver.ts"
import { takeSystemPromptAppend } from "../../src/server/system-prompt/core/system-prompt.ts"
import type { ModelAlias } from "../../src/shared/command.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { chooseTw } from "../../src/wiring/workflow-setting.ts"
import type { VariantRequest } from "./variant-request.ts"

/** 書き手を起こすのに要るもの。環境変数とパスは入口が読んで渡す。 */
export type ReportWriter = {
  readonly model: ModelAlias
  /** 1回ごとの空の作業ディレクトリを作る親。リポジトリの外。 */
  readonly workRoot: string
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  readonly claudeConfigDir: string | undefined
}

type WrittenReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

export type WrittenReport =
  | {
      readonly kind: "report"
      readonly event: WrittenReportEvent
      readonly rejectedReasons: readonly string[]
      readonly seconds: number
    }
  | {
      readonly kind: "missing"
      readonly why: "timed-out" | "no-report" | "session-ended"
      readonly rejectedReasons: readonly string[]
      readonly seconds: number
    }

/** `turn-finished` を待つ上限。許可待ちで止まったときもここで切る。 */
const WRITE_TIMEOUT_MILLISECONDS = 300_000

/** 書き手に調べ物も書き込みもさせない。`ToolSearch` は `report` の定義を引くのに要るので外さない。 */
const WRITER_DISALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Agent",
  "Task",
  "Artifact",
  "ArtifactComments",
  "ArtifactData",
] as const satisfies readonly string[]

const WRITER_TURN_STEP_LIMIT = 200

/**
 * `request` を `variant` の版で1回書かせ、`turn-finished` か上限まで待って、最後に届いた `report` を返す。
 * 届かなければ `missing`。書き直させるかは呼ぶ側が決める。駆動は返す前に必ず閉じる。
 */
export async function writeVariantReport(
  request: VariantRequest,
  variant: ReportSchemaVariant,
  writer: ReportWriter,
): Promise<WrittenReport> {
  mkdirSync(writer.workRoot, { recursive: true })
  const cwd = mkdtempSync(join(writer.workRoot, `${request.id}-${variant}-`))
  const startedAt = nowMilliseconds()
  const elapsedSeconds = (): number => Math.round((nowMilliseconds() - startedAt) / 1000)

  return new Promise((resolve) => {
    const state: { report: WrittenReportEvent | undefined; rejectedReasons: string[] } = {
      report: undefined,
      rejectedReasons: [],
    }
    const settle = (ending: "finished" | "timed-out" | "session-ended"): void => {
      clearTimeout(timer)
      driver.close()
      const rejectedReasons = [...state.rejectedReasons]
      if (state.report !== undefined) {
        resolve({ kind: "report", event: state.report, rejectedReasons, seconds: elapsedSeconds() })
        return
      }
      resolve({
        kind: "missing",
        why: ending === "finished" ? "no-report" : ending,
        rejectedReasons,
        seconds: elapsedSeconds(),
      })
    }
    const settleOnce = onceOnly(settle)
    const timer = setTimeout(() => {
      settleOnce("timed-out")
    }, WRITE_TIMEOUT_MILLISECONDS)

    const driver = startSdkDriver({
      cwd,
      expressions: [{ name: "default", label: "ふつう" }],
      permissionMode: "bypassPermissions",
      model: writer.model,
      effort: "medium",
      systemPromptAppend: takeSystemPromptAppend({
        persona: "",
        mode: {
          kind: "work",
          memory: {
            chatSummary: { read: () => undefined },
            readRecent: () => [],
            readbackLimits: { recentBytes: 0 },
          },
        },
      }),
      start: { kind: "new" },
      tag: "tsukumo-variant-writer",
      onSessionMarked: () => {},
      mode: { kind: "work", reportSchema: variant, figurePreference: "chart" },
      disallowedTools: WRITER_DISALLOWED_TOOLS,
      turnStepLimit: WRITER_TURN_STEP_LIMIT,
      inheritedEnv: writer.inheritedEnv,
      claudeConfigDir: writer.claudeConfigDir,
      mountWorkflowPlugin: false,
      mountFigurePlugin: false,
      workflowTw: chooseTw(undefined, false),
      onEvent: (event) => {
        switch (event.kind) {
          case "report":
            state.report = event
            return
          case "report-rejected":
            state.rejectedReasons.push(...event.reasons)
            return
          case "turn-finished":
            settleOnce("finished")
            return
          case "session-ended":
            settleOnce("session-ended")
            return
          default:
            return
        }
      },
      now: nowMilliseconds,
      diagnose: (diagnostic) => {
        if (diagnostic.flow === "swallowed-failure") {
          process.stderr.write(`  駆動の失敗: ${diagnostic.place}\n`)
        }
      },
    })

    driver.prompt(request.text, [], "request")
  })
}

function nowMilliseconds(): number {
  return Temporal.Now.instant().epochMilliseconds
}

function onceOnly<A>(handler: (argument: A) => void): (argument: A) => void {
  const called = { done: false }
  return (argument) => {
    if (called.done) {
      return
    }
    called.done = true
    handler(argument)
  }
}
