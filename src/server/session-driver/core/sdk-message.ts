// SDK から届いたメッセージを、tsukumo 内部のイベント（`SessionEvent`）に変換する。
//
// 届くメッセージは外部由来の値なので、構造を信用せず unknown で受けて検証する。
// 知らない種別・壊れた形は空の並びにして無視する。種別は Claude Code の更新で増える。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも書かない。

import { isPlainObject } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import { reportArgumentCharsOf } from "../../../shared/report/report-argument-chars.ts"
import { parsePhaseResult } from "../../../shared/session/phase-result.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { parseWorkPlan } from "../../../shared/session/work-plan.ts"
import { isBlankText } from "../../../shared/utils/blank-text.ts"
import { nonBlankString } from "../../../shared/utils/non-blank-string.ts"
import { optionalString } from "../../../shared/utils/optional-string.ts"
import { apiErrorEvents, apiRetryEvents, rateLimitEvents } from "./sdk-api-trouble-message.ts"
import { backgroundTaskEvents, delegateProgressEvents } from "./sdk-background-message.ts"
import { toCommandDescriptions } from "./sdk-query-reply.ts"
import { reportEvents } from "./sdk-report-message.ts"
import { speakToolFullName, speechEvents } from "./sdk-speech-message.ts"
import { partialUtteranceEvents, reportDraftingEvents } from "./sdk-stream-message.ts"
import { toolResultEvents } from "./sdk-tool-result-message.ts"
import { turnOutcome } from "./sdk-turn-outcome-message.ts"
import { stepUsageEvents, tokenUsageEvents } from "./sdk-usage-message.ts"
import {
  PHASE_RESULT_TOOL_NAME,
  REPORT_TOOL_NAME,
  tsukumoToolFullName,
  WORK_PLAN_TOOL_NAME,
} from "./tsukumo-tool-name.ts"

/**
 * SDK のメッセージ1つを内部イベントの並びに変換する。
 * 1つのメッセージから複数のイベントが出ることがある（`assistant` の `content[]` にテキストとツール呼び出しが並ぶため）。
 *
 * - `thinking` は変換しない。モデルの内部の思考なので内部の型にも入れない
 * - サブエージェントの中の本文（`text` と `text_delta`）は変換しない。メインビューの本文はメインのものだけ
 * - `speak` の呼び出しは `tool-started` にしない。`speech` として別に出す（吹き出し行き）。
 *   メインの呼び出しは呼び出しの id を付けた `speak-called` に包む（差し戻しを `CallReview` が決める）
 * - `report` の呼び出しも `tool-started` にしない。`report` として別に出す（メインビュー行き）。
 *   `parent_tool_use_id` のある呼び出し（サブエージェントの中）は捨てる。
 *   ターンのレポートはメインが書くもので、委譲先の報告はメインの手元に届くだけにする
 * - `work_plan` の呼び出しも `tool-started` にしない。メインのものだけを呼び出しの id を付けた `work-plan-called` にし、`parseWorkPlan`（引数の形の正典 `workPlanSchema`）を通らない引数は捨てる。handler も同じ `parseWorkPlan` で差し戻す。
 *   段の一足飛びで差し戻した呼び出しは `CallReview` が結果を見て捨てる
 * - 委譲先（`parent_tool_use_id` 付き）の `SubagentHandback` の呼び出しは、返却が届いた事実を `delegate-handed-back` にする（本文は読まない）。
 *   `tool-started` にはしない
 * - 委譲先の `phase_result` の呼び出しは、`parsePhaseResult` を通れば `phase-result-called` にする。帯を動かすのは handler で、ここは次の返却に `phase_result` が伴った印だけを作る。
 *   通らない引数とメインの呼び出しからは何も作らず、`tool-started` にもしない
 * - `includePartialMessages` の断片で `report` の呼び出しの塊が開いたら `report-drafting` を出す（立ち絵の「書いている」の材料。メインのものだけ）。
 *   引数の断片（`input_json_delta`）は運ばない。
 *   描くのは確定した `report` だけで、書きかけの引数は JSON としても読めない
 * - `expression` は `expressions`（キャラクターパックにある表情名）に無ければ `default` に落とす
 * - `tool-started` の `parentToolUseId` は、メッセージ本体（`message.message` の外）にある `parent_tool_use_id` から取る（サブエージェントの中で動いたツールだけ非 null。実測）。
 *   同じ assistant メッセージに含まれる `tool_use` はすべて同じ値を持つ
 * - `assistant` の `message.usage` は `step-usage` にする（ターンの中を持ち場ごとに割るため）
 * - `conversation_reset` は `/clear` の合図。
 *   tsukumo は `/clear` という文字列を見ず、Claude Code が会話を捨てたことをこのメッセージで知る
 * - `system` / `compact_boundary` は `compact-boundary` にする。
 *   `compact_metadata`（`trigger` / `pre_tokens` / `post_tokens` / `duration_ms`）は画面に出さないので運ばない
 * - `system` / `background_tasks_changed` は `background-tasks-changed` にする。`ambient` が true のもの（活動でないもの）は落とす
 * - `task_progress` は `task_id` と空白でない `summary`（`agentProgressSummaries` で委譲先に作らせる進みの1行）があるものだけを `delegate-progress` にする。
 *   `summary` の無い `task_progress` と、`task_started` / `task_updated` は変換しない。
 *   バックグラウンドタスクが動いているかは `background_tasks_changed`（顔ぶれ全体を毎回運ぶ水準の知らせ）だけで分かる。
 *   始まり・終わりの対を数えると、取りこぼしで「動いている」が居残る（SDK の型定義がそう勧めている）
 * - `task_notification` は顔ぶれには使わず、`tool_use_id` があるときだけ `background-tool-finished` にする（`tool_use_id` は Bash の `tool_use` の id と一致する。実測）。
 *   知らせのあとに claude が依頼なしで始める続きのターンは、ここではなく `withSelfStartedTurns` が `init` の届き方から起こす
 * - メインの `assistant` の `message.model` と `init` の `model` / `permissionMode` は、`setting-confirmed`（見届けた合図）にも写す。
 *   `<synthetic>` のような `<` で始まる値は本物のモデル名ではないので出さない
 * - `assistant` に乗る `local_command_run` が `{ command: "model", args }` の形のときだけ `model-changed` を出す。
 *   `command` が `model` 以外の局所コマンド（`/clear` など）や、形が崩れている・`args` が無いときは出さない。
 *   エイリアスとして知っているかどうかの検証はここでしない（`SessionState` の側で見る）
 * - `system` / `api_retry` は `api-retry`、`rate_limit_event` は `rate-limit-changed`、メインの `assistant` の `error` は `api-error` にする。
 *   運ぶのは型の決まった値（エラーの列挙値・HTTP の状態コード・回数・待ち時間・枠・戻る時刻）だけ。
 *   `result` の `errors` は運ばない（自由文で、会話の断片が混ざりうる）。
 *   `error` の付いた `assistant` の本文は本文として流す（出力の上限で切れた本物の本文のこともあり、Claude Code が作った API エラーの文面と見分ける印が型に無い）
 * - `result` の終わり方は `outcome` に畳む（{@link turnOutcome}。中断は失敗にしない）
 * - 知らない `type`・壊れた形は空の並びを返す（落ちない）
 */
export function toSessionEvents(
  message: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  if (!isPlainObject(message) || typeof message.type !== "string") {
    return []
  }

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return sessionInfoEvents(message)
      }
      if (message.subtype === "commands_changed") {
        return [
          { kind: "command-descriptions", descriptions: toCommandDescriptions(message.commands) },
        ]
      }
      if (message.subtype === "background_tasks_changed") {
        return backgroundTaskEvents(message.tasks)
      }
      if (message.subtype === "task_notification") {
        return typeof message.tool_use_id === "string"
          ? [{ kind: "background-tool-finished", toolUseId: message.tool_use_id }]
          : []
      }
      if (message.subtype === "task_progress") {
        return delegateProgressEvents(message)
      }
      if (message.subtype === "api_retry") {
        return apiRetryEvents(message)
      }
      return message.subtype === "compact_boundary" ? [{ kind: "compact-boundary" }] : []
    case "stream_event":
      return [
        ...partialUtteranceEvents(message.event, optionalString(message.parent_tool_use_id)),
        ...reportDraftingEvents(message.event, optionalString(message.parent_tool_use_id)),
      ]
    case "assistant":
      return assistantMessageEvents(message, expressions)
    case "rate_limit_event":
      return rateLimitEvents(message.rate_limit_info)
    case "user":
      return toolResultEvents(message.message)
    case "result":
      // サブエージェント（Task ツール）の中の `result` が `parent_tool_use_id` 付きで届いたら無視する。
      // ターンの終わりとして扱うと、Claude Code のターンが終わっていないのに `turn-finished` が挟まり、ターンが `finished` に落ちる。
      // SDK が実際にこの形で流すかは未確認（`assistant` の `tool_use` と同じ形のはずという保険）。
      return optionalString(message.parent_tool_use_id) === undefined
        ? [
            ...tokenUsageEvents(message.modelUsage),
            { kind: "turn-finished", outcome: turnOutcome(message) },
          ]
        : []
    case "conversation_reset":
      // `/clear` で Claude Code が会話を捨てたとき。`/compact` では届かない。
      return [{ kind: "conversation-cleared" }]
    default:
      return []
  }
}

/** サブエージェントの中から届いたメッセージか（`parent_tool_use_id` が文字列）。 */
export function isSubagentMessage(message: unknown): boolean {
  return isPlainObject(message) && optionalString(message.parent_tool_use_id) !== undefined
}

function sessionInfoEvents(message: Readonly<Record<string, unknown>>): readonly SessionEvent[] {
  if (typeof message.session_id !== "string") {
    return []
  }

  const model = optionalString(message.model)
  const permissionMode = optionalString(message.permissionMode)
  return [
    {
      kind: "session-info",
      sessionId: message.session_id,
      model,
      permissionMode,
      slashCommands: stringArray(message.slash_commands),
      terminalSlashCommands: stringArray(message.terminal_slash_commands),
      skillNames: stringArray(message.skills),
      agentNames: stringArray(message.agents),
    },
    ...(model === undefined
      ? []
      : [{ kind: "setting-confirmed", setting: "model", value: model } as const]),
    ...(permissionMode === undefined
      ? []
      : [{ kind: "setting-confirmed", setting: "permissionMode", value: permissionMode } as const]),
  ]
}

/** メインの `assistant` メッセージの `message.model`（応答したモデル）を、見届けたモデルにする。 */
function modelConfirmedEvents(
  message: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (parentToolUseId !== undefined || !isPlainObject(message)) {
    return []
  }
  const model = nonBlankString(message.model)
  return model === undefined || model.startsWith("<")
    ? []
    : [{ kind: "setting-confirmed", setting: "model", value: model }]
}

/**
 * `assistant` メッセージ1つを変換する。
 * `parent_tool_use_id` を読むのはここだけで、本文・ツールの呼び出し・ステップの使用量が同じ「どの持ち場で起きたか」の印を共有する。
 */
function assistantMessageEvents(
  message: Readonly<Record<string, unknown>>,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  const parentToolUseId = optionalString(message.parent_tool_use_id)
  return [
    ...assistantEvents(message.message, expressions, parentToolUseId),
    ...stepUsageEvents(message.message, parentToolUseId),
    ...modelConfirmedEvents(message.message, parentToolUseId),
    ...modelChangeEvents(message.local_command_run),
    // `step-usage` より後ろに置く。
    // 畳み込みはステップの使用量を「モデルが応答した」合図にして API の不調を下ろすので、同じメッセージの `error` をその前に置くと消えてしまう。
    ...apiErrorEvents(message.error, parentToolUseId),
  ]
}

/**
 * `assistant` に乗る `local_command_run` から `/model` の合図を取り出す。
 * `command` が `model` 以外の局所コマンド（`/clear` など）では何も出さない。
 * `args` が文字列でない・無い・空（引数なしの `/model` はモデルの選択を出すだけで切り替えない）ときも同様。
 */
function modelChangeEvents(localCommandRun: unknown): readonly SessionEvent[] {
  if (!isPlainObject(localCommandRun) || localCommandRun.command !== "model") {
    return []
  }

  const args = optionalString(localCommandRun.args)?.trim()
  return args === undefined || args === "" ? [] : [{ kind: "model-changed", model: args }]
}

function assistantEvents(
  message: unknown,
  expressions: readonly Expression[],
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (!isPlainObject(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((block) =>
    assistantBlockEvents(block, expressions, parentToolUseId),
  )
}

function assistantBlockEvents(
  block: unknown,
  expressions: readonly Expression[],
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (!isPlainObject(block)) {
    return []
  }

  if (block.type === "text") {
    // サブエージェントの本文は委譲先の独り言で、メインの手元に届くだけにする。
    // 途中の一言は委譲先が `SendMessage` で送り、メインが `speak` で言い直す（`SPEECH_CADENCE_PROMPT`）。
    return parentToolUseId === undefined &&
      typeof block.text === "string" &&
      !isBlankText(block.text)
      ? [{ kind: "utterance", text: block.text }]
      : []
  }

  if (block.type !== "tool_use" || typeof block.name !== "string") {
    return []
  }

  if (block.name === speakToolFullName()) {
    const speeches = speechEvents(block.input, expressions)
    const toolUseId = block.id
    return parentToolUseId === undefined && typeof toolUseId === "string"
      ? speeches.map((speech): SessionEvent => ({ kind: "speak-called", toolUseId, speech }))
      : speeches
  }

  if (block.name === tsukumoToolFullName(REPORT_TOOL_NAME)) {
    if (parentToolUseId !== undefined || typeof block.id !== "string") {
      return []
    }
    const reports = reportEvents(block.id, block.input, expressions)
    return reports.length > 0
      ? reports
      : [
          {
            kind: "report-malformed",
            toolUseId: block.id,
            argumentChars: reportArgumentCharsOf(block.input),
          },
        ]
  }

  if (block.name === tsukumoToolFullName(WORK_PLAN_TOOL_NAME)) {
    return parentToolUseId === undefined && typeof block.id === "string"
      ? workPlanEvents(block.id, block.input)
      : []
  }

  if (block.name === tsukumoToolFullName(PHASE_RESULT_TOOL_NAME)) {
    return parentToolUseId !== undefined && parsePhaseResult(block.input) !== undefined
      ? [{ kind: "phase-result-called", delegate: parentToolUseId }]
      : []
  }

  if (
    block.name === SUBAGENT_HANDBACK_TOOL_NAME &&
    parentToolUseId !== undefined &&
    isPlainObject(block.input)
  ) {
    return [{ kind: "delegate-handed-back", delegate: parentToolUseId }]
  }

  return typeof block.id === "string"
    ? [
        {
          kind: "tool-started",
          toolUseId: block.id,
          name: block.name,
          input: block.input,
          parentToolUseId,
        },
      ]
    : []
}

/** 委譲先が返却を渡すツールの名前。メインの query に `parent_tool_use_id` 付きで流れる。 */
const SUBAGENT_HANDBACK_TOOL_NAME = "SubagentHandback"

function workPlanEvents(toolUseId: string, input: unknown): readonly SessionEvent[] {
  const plan = parseWorkPlan(input)
  return plan === undefined ? [] : [{ kind: "work-plan-called", toolUseId, plan }]
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
}
