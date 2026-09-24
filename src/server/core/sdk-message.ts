// SDK から届いたメッセージを、tsukumo 内部のイベント（src/shared/session-event.ts）に変換する。
//
// **SDK の型を import しない。** SDK への依存は src/server/adapter/ 直下の `sdk-` で始まるファイルに
// 閉じる（docs/design.md 5章）。届くメッセージは外部由来の値なので、どのみち構造を信用せず
// unknown で受けて検証する（docs/coding-standards.md「型を迂回するキャストを使わない」）。
// 知らない種別・壊れた形は**空の並び**にして無視する。種別は本体の更新で増える
// （docs/architecture.md「既知の制約・注意点」）。
//
// **会話の内容がここを通る。** 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも
// 書かない（docs/coding-standards.md「会話内容の扱い」）。

import { isPlainObject } from "remeda"

import { API_ERROR_KINDS, type ApiErrorKind } from "../../shared/api-trouble.ts"
import { type BackgroundTask, type BackgroundTaskKind } from "../../shared/background-task.ts"
import { isBlankText } from "../../shared/blank-text.ts"
import { type Expression } from "../../shared/expression.ts"
import { type RateLimit, type RateLimitBucket } from "../../shared/rate-limit.ts"
import { type CommandDescription, type SessionEvent } from "../../shared/session-event.ts"
import { type ModelTokenUsage } from "../../shared/token-usage.ts"
import { type TurnOutcome } from "../../shared/turn-failure.ts"
import { optionalString } from "../../shared/utils/optional-string.ts"

/** プロセス内の MCP サーバの名前。モデルからは `mcp__<サーバ名>__<ツール名>` として見える。 */
export const TSUKUMO_MCP_SERVER_NAME = "tsukumo"
/** セリフを受け取るツールの名前（docs/glossary.md「speak ツール」）。 */
export const SPEAK_TOOL_NAME = "speak"
/**
 * レポートを受け取るツールの名前（docs/glossary.md「report ツール」）。載るのは仕事のときだけ
 * （`src/server/adapter/sdk-tool.ts`）。雑談では呼ばれないので、見分ける側はいつも見ている。
 */
export const REPORT_TOOL_NAME = "report"

/**
 * SDK のメッセージ1つを内部イベントの並びに変換する。1つのメッセージから複数のイベントが
 * 出ることがある（`assistant` の `content[]` にテキストとツール呼び出しが並ぶため）。
 *
 * - **`thinking` は変換しない。** モデルの内部の思考なので内部の型にも入れない
 *   （docs/requirements.md 4.1）
 * - **サブエージェントの中の本文（`text` と `text_delta`）は変換しない。** メインビューの本文は
 *   メインのものだけ
 * - **`speak` の呼び出しは `tool-started` にしない。** `speech` として別に出す（吹き出し行き）
 * - **`report` の呼び出しも `tool-started` にしない。** `report` として別に出す（メインビュー行き）。
 *   **`parent_tool_use_id` のある呼び出し（サブエージェントの中）は捨てる**——ターンの
 *   レポートはメインが書くもので、委譲先の報告はメインの手元に届くだけにする
 * - **`includePartialMessages` の断片で `report` の呼び出しの塊が開いたら `report-drafting` を
 *   出す**（立ち絵の「書いている」の材料。メインのものだけ）。引数の断片（`input_json_delta`）は
 *   運ばない——描くのは確定した `report` だけで、書きかけの引数は JSON としても読めない
 * - `expression` は `expressions`（キャラクター定義にある表情名）に無ければ `default` に落とす
 *   （docs/architecture.md 原則4 — 表情名をコードに書かない）
 * - **`tool-started` の `parentToolUseId`** は、メッセージ本体（`message.message` の外）にある
 *   `parent_tool_use_id` から取る（サブエージェントの中で動いたツールだけ非 null。実測）。
 *   同じ assistant メッセージに含まれる `tool_use` はすべて同じ値を持つ
 * - **`assistant` の `message.usage` は `step-usage` にする**（ターンの中を持ち場ごとに割るため。
 *   同じ `message.id` の最後を取るのは受け取る側の仕事）
 * - **`result` も `parent_tool_use_id` が非 null なら `turn-finished` にしない。**
 *   サブエージェント（Task ツール）の中の `result` を本体のターンの終わりと取り違えない
 *   ための保険（未確認。SDK が実際にこの形で流すかは再現していない）
 * - **`conversation_reset` は `/clear` の合図。** tsukumo は `/clear` という
 *   文字列を見ず、本体が会話を捨てたことをこのメッセージで知る
 * - **`system` / `compact_boundary` は `compact-boundary` にする**（docs/glossary.md
 *   「圧縮の区切り」）。`compact_metadata` の数値は運ばない
 * - **`system` / `background_tasks_changed` は `background-tasks-changed` にする**
 *   （docs/glossary.md「背景のタスク」）。`ambient` が true のもの（活動でないもの）は落とす
 * - **`task_started` / `task_progress` / `task_updated` / `task_notification` は変換しない。**
 *   背景のタスクが動いているかは `background_tasks_changed`（顔ぶれ全体を毎回運ぶ水準の知らせ）
 *   だけで分かり、始まり・終わりの対を数えると取りこぼしで「動いている」が居残る（SDK の型定義が
 *   そう勧めている）。**知らせのあとに claude が依頼なしで始める続きのターン**は、ここではなく
 *   `src/server/core/self-started-turn.ts` が `init` の届き方から起こす
 * - **`assistant` に乗る `local_command_run` が `{ command: "model", args }` の形のときだけ
 *   `model-changed` を出す。** `command` が `model` 以外の局所コマンド
 *   （`/clear` など）や、形が崩れている・`args` が無いときは出さない。エイリアスとして
 *   知っているかどうかの検証はここでしない（docs/design.md 4.1、session-state.ts の仕事）
 * - **`system` / `api_retry` は `api-retry`、`rate_limit_event` は `rate-limit-changed`、
 *   メインの `assistant` の `error` は `api-error` にする**（docs/requirements.md 4.1）。運ぶのは
 *   型の決まった値（エラーの列挙値・HTTP の状態コード・回数・待ち時間・枠・戻る時刻）だけで、
 *   **`result` の `errors` は運ばない**（自由文で、会話の断片が混ざりうる）。`error` の付いた
 *   `assistant` の本文は今までどおり本文として流す（出力の上限で切れた本物の本文のこともあり、
 *   本体が作った API エラーの文面と見分ける印が型に無い）
 * - **`result` の終わり方は `outcome` に畳む**（{@link turnOutcome}。中断は失敗にしない）
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
      if (message.subtype === "api_retry") {
        return apiRetryEvents(message)
      }
      // `compact_boundary` は claude 自身の圧縮が起きた合図（`compact_metadata` に
      // `trigger` / `pre_tokens` / `post_tokens` / `duration_ms` が乗るが、画面には
      // 出さないので運ばない。docs/chat-mode.md 4.9「記憶の圧縮と忘却」）。
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
      // サブエージェント（Task ツール）の中の `result` が `parent_tool_use_id` 付きで届くなら
      // （`assistant` の `tool_use` と同じ形のはずだが、SDK が実際にこの形で流すかは未確認）、
      // それをターンの終わりとして扱うと、本体のターンが終わっていないのに `turn-finished` が
      // 挟まり、ターンが `finished` に落ちてしまうので無視する（案4-c）。
      return optionalString(message.parent_tool_use_id) === undefined
        ? [
            ...tokenUsageEvents(message.modelUsage),
            { kind: "turn-finished", outcome: turnOutcome(message) },
          ]
        : []
    case "conversation_reset":
      // `/clear` で本体が会話を捨てたとき。**`/compact` では届かない。**
      return [{ kind: "conversation-cleared" }]
    default:
      return []
  }
}

/**
 * SDK が返すコマンド一覧（`supportedCommands()` の戻り値と `commands_changed` の `commands`）を
 * 検証して内部の型に変える。**駆動側（src/server/adapter/sdk-driver.ts）が制御リクエストの結果に対しても
 * これを使う**ので、`toSessionEvents` とは別に公開してある（検証の場所を1つにするため）。
 * 名前が文字列でない要素は捨て、説明が空文字のものは `undefined` にする。
 */
export function toCommandDescriptions(value: unknown): readonly CommandDescription[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item) || typeof item.name !== "string" || item.name === "") {
      return []
    }
    const description = optionalString(item.description)
    return [{ name: item.name, description: description === "" ? undefined : description }]
  })
}

/**
 * `accountInfo()` の戻り値からプラン（`docs/glossary.md`「プラン」）を取り出す。**`email` /
 * `organization` はここで捨てる**（駆動の外へ出さない。呼び出し側はこの関数の戻り値しか
 * 受け取らないので、他のフィールドに触れる経路が無い）。空文字は「無い」に畳む。
 */
export function toPlan(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const plan = optionalString(value.subscriptionType)
  return plan === "" ? undefined : plan
}

/**
 * サブエージェントの中から届いたメッセージか（`parent_tool_use_id` が文字列）。`report` の関所
 * （`src/server/core/report-tool.ts` の `createReportGate`）にメインの本文だけを渡すために、
 * 駆動（`src/server/adapter/sdk-driver.ts`）が {@link toSessionEvents} と並べて使う。
 */
export function isSubagentMessage(message: unknown): boolean {
  return isPlainObject(message) && optionalString(message.parent_tool_use_id) !== undefined
}

function sessionInfoEvents(message: Readonly<Record<string, unknown>>): readonly SessionEvent[] {
  if (typeof message.session_id !== "string") {
    return []
  }

  return [
    {
      kind: "session-info",
      sessionId: message.session_id,
      model: optionalString(message.model),
      permissionMode: optionalString(message.permissionMode),
      slashCommands: stringArray(message.slash_commands),
      terminalSlashCommands: stringArray(message.terminal_slash_commands),
    },
  ]
}

/**
 * `background_tasks_changed` の `tasks`（変わったあとの全員）を内部の型に写す。**`tasks` が
 * 配列でなければイベントを出さない**（壊れた知らせで、動いているものを空に倒さない）。要素のうち
 * `task_id` が文字列でないものと、`ambient` が true のもの（SDK が「活動の印から外せ」と言う
 * 見張り役など）は捨てる。`description` が無ければ空の文字列に畳む（描く側は種類だけ出す）。
 */
function backgroundTaskEvents(tasks: unknown): readonly SessionEvent[] {
  if (!Array.isArray(tasks)) {
    return []
  }

  return [
    {
      kind: "background-tasks-changed",
      tasks: tasks.flatMap((task): readonly BackgroundTask[] =>
        !isPlainObject(task) || typeof task.task_id !== "string" || task.ambient === true
          ? []
          : [
              {
                taskId: task.task_id,
                kind: backgroundTaskKind(task.task_type),
                description: optionalString(task.description) ?? "",
              },
            ],
      ),
    },
  ]
}

/**
 * SDK の `task_type` を3つに畳む（{@link BackgroundTaskKind}）。実測で見たのは `local_bash`
 * （`run_in_background` の Bash）と `local_agent`（背景のサブエージェント）の2つ。
 */
function backgroundTaskKind(taskType: unknown): BackgroundTaskKind {
  switch (taskType) {
    case "local_bash":
      return "shell"
    case "local_agent":
      return "agent"
    default:
      return "other"
  }
}

/**
 * `includePartialMessages` で流れる断片から、本文のテキストだけを拾う。
 * 本文以外のイベント（`content_block_start` / `message_delta` など）は無視する。
 * **メインの断片だけ**（サブエージェントの本文は拾わない。{@link assistantBlockEvents}）。
 */
function partialUtteranceEvents(
  event: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (
    parentToolUseId !== undefined ||
    !isPlainObject(event) ||
    event.type !== "content_block_delta" ||
    !isPlainObject(event.delta)
  ) {
    return []
  }

  const delta = event.delta
  if (delta.type !== "text_delta" || typeof delta.text !== "string" || delta.text === "") {
    return []
  }

  return [{ kind: "partial-utterance", text: delta.text }]
}

/**
 * `includePartialMessages` の断片のうち、メインの `report` の呼び出しの塊が開いた合図
 * （`content_block_start` の `tool_use`）だけを `report-drafting` にする。
 */
function reportDraftingEvents(
  event: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (
    parentToolUseId !== undefined ||
    !isPlainObject(event) ||
    event.type !== "content_block_start" ||
    !isPlainObject(event.content_block)
  ) {
    return []
  }

  const block = event.content_block
  return block.type === "tool_use" &&
    block.name === tsukumoToolFullName(REPORT_TOOL_NAME) &&
    typeof block.id === "string"
    ? [{ kind: "report-drafting", toolUseId: block.id }]
    : []
}

/**
 * `assistant` メッセージ1つを変換する。**`parent_tool_use_id` を読むのはここだけ**——本文・
 * ツールの呼び出し・ステップの使用量が、同じ「どの持ち場で起きたか」の印を共有する。
 */
function assistantMessageEvents(
  message: Readonly<Record<string, unknown>>,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  const parentToolUseId = optionalString(message.parent_tool_use_id)
  return [
    ...assistantEvents(message.message, expressions, parentToolUseId),
    ...stepUsageEvents(message.message, parentToolUseId),
    ...modelChangeEvents(message.local_command_run),
    // **`step-usage` より後ろに置く。** 畳み込みはステップの使用量を「モデルが応答した」合図に
    // して API の不調を下ろすので、同じメッセージの `error` をその前に置くと消えてしまう。
    ...apiErrorEvents(message.error, parentToolUseId),
  ]
}

/**
 * `assistant` の `error` を `api-error` にする。**メインのものだけ**（サブエージェントの中の
 * エラーは本体のターンの終わり方に効かない）。知らない綴りは `unknown` に畳む。
 */
function apiErrorEvents(
  error: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  return parentToolUseId === undefined && typeof error === "string"
    ? [{ kind: "api-error", error: toApiErrorKind(error) }]
    : []
}

/**
 * `system` / `api_retry` を `api-retry` にする。回数・上限・待ち時間のどれかが数でなければ
 * 出さない（壊れた知らせで「再試行中」を出さない）。`error_status` の `null`（応答が無かった
 * 失敗）と数でない値は undefined に畳む。`no_response` の内訳は運ばない（画面は待ち時間しか
 * 出さない）。
 */
function apiRetryEvents(message: Readonly<Record<string, unknown>>): readonly SessionEvent[] {
  const { attempt, max_retries: maxRetries, retry_delay_ms: retryDelayMs } = message
  if (!isFiniteNumber(attempt) || !isFiniteNumber(maxRetries) || !isFiniteNumber(retryDelayMs)) {
    return []
  }

  return [
    {
      kind: "api-retry",
      retry: {
        attempt,
        maxRetries,
        retryDelayMs,
        errorStatus: isFiniteNumber(message.error_status) ? message.error_status : undefined,
        error: toApiErrorKind(message.error),
      },
    },
  ]
}

function toApiErrorKind(value: unknown): ApiErrorKind {
  return API_ERROR_KINDS.find((kind) => kind === value) ?? "unknown"
}

/**
 * `rate_limit_event` の `rate_limit_info` を `rate-limit-changed` にする。`status` が3つの
 * どれでもなければ出さない。**`resetsAt` は秒で届くのでミリ秒に直す**（Claude Code 本体が
 * `resetsAt*1000` で扱っているのを 0.3.280 の同梱の本体で確かめた）。超過利用（`overage*`）と
 * 使用率は運ばない（`src/shared/rate-limit.ts`）。
 */
function rateLimitEvents(info: unknown): readonly SessionEvent[] {
  if (!isPlainObject(info)) {
    return []
  }

  const rateLimit = toRateLimit(info)
  return rateLimit === undefined ? [] : [{ kind: "rate-limit-changed", rateLimit }]
}

function toRateLimit(info: Readonly<Record<string, unknown>>): RateLimit | undefined {
  switch (info.status) {
    case "allowed":
      return { kind: "clear" }
    case "allowed_warning":
    case "rejected":
      return {
        kind: info.status === "rejected" ? "rejected" : "warning",
        bucket: rateLimitBucket(info.rateLimitType),
        resetsAt: isFiniteNumber(info.resetsAt) ? info.resetsAt * 1000 : undefined,
      }
    default:
      return undefined
  }
}

function rateLimitBucket(value: unknown): RateLimitBucket {
  switch (value) {
    case "five_hour":
      return "five-hour"
    case "seven_day":
    case "seven_day_overage_included":
      return "seven-day"
    case "seven_day_opus":
      return "seven-day-opus"
    case "seven_day_sonnet":
      return "seven-day-sonnet"
    case "overage":
      return "overage"
    default:
      return "other"
  }
}

/**
 * `assistant` に乗る `local_command_run` から `/model` の合図を取り出す。**`command` が
 * `model` 以外の局所コマンド（`/clear` など）では何も出さない。** `args` が文字列でない・
 * 無い・空（引数なしの `/model` はモデルの選択を出すだけで切り替えない）ときも同様
 * （docs/design.md 4.1）。
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
    // サブエージェントの本文は委譲先の独り言で、メインの手元に届くだけにする（`report` と同じ）。
    // 進み具合は委譲先が `SendMessage` で送り、メインが `speak` で言い直す
    // （`src/server/core/speech-cadence.ts`）。
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
    return speechEvents(block.input, expressions)
  }

  if (block.name === tsukumoToolFullName(REPORT_TOOL_NAME)) {
    return parentToolUseId === undefined && typeof block.id === "string"
      ? reportEvents(block.id, block.input)
      : []
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

function speechEvents(input: unknown, expressions: readonly Expression[]): readonly SessionEvent[] {
  if (!isPlainObject(input) || typeof input.text !== "string") {
    return []
  }

  return [
    { kind: "speech", text: input.text, expression: toExpression(input.expression, expressions) },
  ]
}

/**
 * `report` の引数を取り出す。**`body` と `favor` の「無い」は空の文字列に畳む**（描く側は空の塊を
 * 置かないだけで済む）。`conclusion` が文字列でなければ捨てる（引数の検査に落ちた呼び出しで、
 * モデルには本体がエラーを返す）。
 */
function reportEvents(toolUseId: string, input: unknown): readonly SessionEvent[] {
  if (!isPlainObject(input) || typeof input.conclusion !== "string") {
    return []
  }

  return [
    {
      kind: "report",
      toolUseId,
      conclusion: input.conclusion,
      body: optionalString(input.body) ?? "",
      favor: optionalString(input.favor) ?? "",
    },
  ]
}

/** モデルから見えるツールのフルネーム。MCP サーバ名とツール名から決まる。 */
function speakToolFullName(): string {
  return tsukumoToolFullName(SPEAK_TOOL_NAME)
}

/** tsukumo のツールのフルネーム（`mcp__tsukumo__<ツール名>`）。 */
export function tsukumoToolFullName(toolName: string): string {
  return `mcp__${TSUKUMO_MCP_SERVER_NAME}__${toolName}`
}

function toExpression(value: unknown, expressions: readonly Expression[]): Expression {
  if (typeof value !== "string") {
    return "default"
  }

  return expressions.find((expression) => expression === value) ?? "default"
}

function toolResultEvents(message: unknown): readonly SessionEvent[] {
  if (!isPlainObject(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((block) => toolResultBlockEvents(block))
}

function toolResultBlockEvents(block: unknown): readonly SessionEvent[] {
  if (
    !isPlainObject(block) ||
    block.type !== "tool_result" ||
    typeof block.tool_use_id !== "string"
  ) {
    return []
  }

  return [
    {
      kind: "tool-finished",
      toolUseId: block.tool_use_id,
      content: toolResultContentText(block.content),
      isError: block.is_error === true,
    },
  ]
}

/**
 * `tool_result` の `content` は文字列のことが多いが、複数ブロックの配列のこともある。
 * テキストのブロックだけをつなぎ、テキスト以外（画像など）は中身を持ち出さず種別のラベルだけ残す。
 */
function toolResultContentText(content: unknown): string {
  if (typeof content === "string") {
    return content
  }
  if (!Array.isArray(content)) {
    return ""
  }

  return content.map((item) => toolResultContentItemText(item)).join("\n\n")
}

function toolResultContentItemText(item: unknown): string {
  if (!isPlainObject(item)) {
    return ""
  }
  if (item.type === "text" && typeof item.text === "string") {
    return item.text
  }

  return typeof item.type === "string" ? `(${item.type})` : ""
}

/**
 * `assistant` の `message.usage`（そのステップぶんの使用量）を1つのイベントにする。
 * **`message.id` を一緒に運ぶ**——返答が流れている間は同じ id の `assistant` が何度も届き、
 * 途中の `usage` は確定値ではない（`sdk.d.ts`。最初の1つは `output_tokens` が 1〜3 になる）ので、
 * **同じ id の最後を取る**のは受け取った側（`src/server/core/token-usage.ts`）の仕事。
 *
 * 持ち場は `parent_tool_use_id` で決まる（非 null ならサブエージェントの中。`sdk.d.ts`）。
 * **鍵は API の形（snake_case）**で、`result` の `modelUsage`（camelCase）とは違う。数でない値・
 * 欠けている鍵・`null` は 0 に倒し、`id` が無い・`usage` が無いメッセージはイベントを出さない。
 */
function stepUsageEvents(
  message: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (!isPlainObject(message) || typeof message.id !== "string" || message.id === "") {
    return []
  }
  if (!isPlainObject(message.usage)) {
    return []
  }

  const usage = message.usage
  return [
    {
      kind: "step-usage",
      messageId: message.id,
      scope: parentToolUseId === undefined ? "main" : "subagent",
      usage: {
        inputTokens: finiteNumber(usage.input_tokens),
        outputTokens: finiteNumber(usage.output_tokens),
        cacheReadInputTokens: finiteNumber(usage.cache_read_input_tokens),
        cacheCreationInputTokens: finiteNumber(usage.cache_creation_input_tokens),
      },
    },
  ]
}

/**
 * `result` の `modelUsage`（モデル名をキーにした使用量の表）を1つのイベントにする。
 *
 * **運ぶのは累計そのまま。** `modelUsage` は `query()` の中の走行合計で、サブエージェントと
 * 内部の呼び出しも含む（同じ `result` の `usage` はメインループぶんだけなので集計に使わない。
 * `sdk.d.ts` の型定義で確認）。ターンごとの増分に直すのは
 * `src/server/core/token-usage.ts` で、前回の累計を覚えるのは `session-manager.ts`。
 *
 * 数でない値・欠けている鍵は 0 に倒す（外部由来の値なので形を信用しない）。表が無い・空・
 * 中身が全部壊れているときはイベントを出さない。
 */
function tokenUsageEvents(modelUsage: unknown): readonly SessionEvent[] {
  if (!isPlainObject(modelUsage)) {
    return []
  }

  const cumulative = Object.entries(modelUsage).flatMap(([model, value]) =>
    model === "" || !isPlainObject(value) ? [] : [toModelTokenUsage(model, value)],
  )
  return cumulative.length === 0 ? [] : [{ kind: "token-usage", cumulative }]
}

/** `modelUsage` の1件を内部の型に写す。**キーがモデルの名前**（`canonicalModel` は見ない）。 */
function toModelTokenUsage(
  model: string,
  value: Readonly<Record<string, unknown>>,
): ModelTokenUsage {
  return {
    model,
    inputTokens: finiteNumber(value.inputTokens),
    outputTokens: finiteNumber(value.outputTokens),
    thinkingTokens: finiteNumber(value.thinkingTokens),
    cacheReadInputTokens: finiteNumber(value.cacheReadInputTokens),
    cacheCreationInputTokens: finiteNumber(value.cacheCreationInputTokens),
    costUsd: finiteNumber(value.costUSD),
  }
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * `result` を終わり方に畳む（`src/shared/turn-failure.ts` の {@link TurnOutcome}）。
 *
 * - `success` は完了。**ただし `is_error` が true なら API のエラーで止まった失敗**（SDK の型定義:
 *   「with is_error true, the error text when the turn ended on an API error」）
 * - `error_max_turns` / `error_max_budget_usd` はそれぞれの上限に当たった失敗
 * - **`error_during_execution` は中断のことが多い**（中断されたターンはこれで終わる。実測）。
 *   `terminal_reason` が中断（`aborted_streaming` / `aborted_tools`）か、無い（古い本体）ときは
 *   中断に倒し、それ以外の理由が付いているときだけ実行中のエラーの失敗にする
 * - 知らない subtype は実行中のエラーの失敗（成功と言い切れないものを黙って成功にしない）
 */
function turnOutcome(message: Readonly<Record<string, unknown>>): TurnOutcome {
  switch (message.subtype) {
    case "success":
      return message.is_error === true
        ? { kind: "failed", cause: { kind: "api-error" } }
        : { kind: "completed" }
    case "error_max_turns":
      return { kind: "failed", cause: { kind: "max-turns" } }
    case "error_max_budget_usd":
      return { kind: "failed", cause: { kind: "max-budget" } }
    case "error_during_execution":
      return INTERRUPTED_TERMINAL_REASONS.has(message.terminal_reason)
        ? { kind: "interrupted" }
        : { kind: "failed", cause: { kind: "execution-error" } }
    default:
      return { kind: "failed", cause: { kind: "execution-error" } }
  }
}

/**
 * `error_during_execution` を中断とみなす `terminal_reason`。**無い（undefined）も含める**——
 * `terminal_reason` を載せない古い本体でも、中断を失敗と出さないため。
 */
const INTERRUPTED_TERMINAL_REASONS: ReadonlySet<unknown> = new Set([
  "aborted_streaming",
  "aborted_tools",
  undefined,
])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
}
