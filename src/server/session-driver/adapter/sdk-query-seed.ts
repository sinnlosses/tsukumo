// `query()` に渡す `options` のうち `mcpServers` / `canUseTool`（クロージャが要る）を除いた部分と、
// `Stop`・`PreToolUse`・`PostToolUse` などのフックの登録を組み立てる。

import { setImmediate } from "node:timers/promises"

import type {
  BaseHookInput,
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  SdkPluginConfig,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk"

import {
  type EffortLevel,
  isEffortLevel,
  isPermissionMode,
  type PermissionMode,
} from "../../../shared/command.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import { PHASE_RESULT_TOOL_NAME, tsukumoToolFullName } from "../../core/tsukumo-tool-name.ts"
import type { ReportGate } from "../../report/core/report-tool.ts"
import { judgePhaseResultCaller } from "../../work-plan/core/phase-result-tool.ts"
import {
  GATED_TOOL_MATCHER,
  judgeEditAgainstMissingPlan,
  judgeToolAgainstGate,
} from "../../work-plan/core/work-plan-gate.ts"
import { pinToBackground } from "../core/background-delegation.ts"
import { rewriteBashCommand } from "../core/bash-command-rewrite.ts"
import type { CallReview } from "../core/call-review.ts"
import type { ExternalToolMark } from "../core/external-tool-mark.ts"
import type { SessionDriverOptions, SessionMode } from "../core/session-driver.ts"
import {
  type ToolHookClock,
  type ToolHookDurationLap,
  toolHookDurationTool,
} from "../core/tool-hook-clock.ts"
import { childProcessEnv } from "../core/visible-output-nudge.ts"
import { figurePluginDir, workflowPluginDir } from "./workflow-plugin.ts"

/** `query()` の `options` のうち、`mcpServers` / `canUseTool`（クロージャが要る）を除いた部分。 */
export type QuerySeedOptions = {
  readonly cwd: string
  /**
   * cwd の外で、許可を聞かずに読める場所。キャラクターパックの置き場（`~/.tsukumo/characters/`）だけ。
   * 雑談の画面には許可の問い合わせが出ないので、無いと cwd の外の読み取りは答えが来ないまま止まる。
   * 会話のアーカイブなどホームのほかの置き場は含めない。
   */
  readonly additionalDirectories: string[]
  readonly includePartialMessages: true
  /** 委譲先の `task_progress` に `summary`（進みの1行）を載せさせる。 */
  readonly agentProgressSummaries: true
  readonly systemPrompt: {
    readonly type: "preset"
    readonly preset: "claude_code"
    readonly append: string
  }
  readonly permissionMode: PermissionMode
  readonly model: string
  readonly effort: EffortLevel
  /**
   * 続きから始めるセッションのID。新規に起こすときは undefined（SDK 側は省略と同じ扱い）。
   * `SessionDriverOptions.start` を `query()` 自身の語彙（`resume?: string`）へ畳んだ値で、外の世界（SDK）の形をそのまま写す。
   * `docs/coding-standards.md`「「無いかもしれない」値」の例外1。
   */
  readonly resume: string | undefined
  /**
   * ターンの最後の応答が空だと Claude Code が差し込む催促（`[Your previous response had no visible output. ...]`）への返事が、指定なしだと日本語の依頼でも英語に滑るための保険。
   * 値は固定で、キャラクターパックや利用者から変える口は作らない。
   */
  readonly settings: { readonly language: "japanese" }
  /**
   * 子プロセスの環境変数。
   * 渡すと tsukumo 自身の環境と混ざらず丸ごと置き換わるので、引き継いだ環境に Claude Code の催促を止める変数を足したもの（`childProcessEnv`）を渡す。
   */
  readonly env: Readonly<Record<string, string | undefined>>
  /** 文脈から消す組み込みツール。 */
  readonly disallowedTools: string[]
  /** セッションに載せるプラグイン。同梱の `plugin/`（`tsukumo:token-usage-diet`）と、取り込んだ tsukumo-plugins（`mountWorkflowPlugin` のときだけ）と、その図のプラグイン（`mountFigurePlugin` のときだけ）。 */
  readonly plugins: SdkPluginConfig[]
}

/**
 * `query()` に渡す `options` のうち、クロージャを含まない部分を組み立てる。
 *
 * モデル・effort・許可モードは呼び出し側から来る（覚えた既定）。
 * ここで定数に倒すと、歯車で変えた既定が起こし直しても効かない。
 * effort は対応しないモデル（`haiku` など）でも渡す。
 * `query()` 自身が対応の有無で読み分けるので、渡すかどうかをここでモデルごとに出し分けない。
 */
export function buildQuerySeedOptions(options: SessionDriverOptions): QuerySeedOptions {
  return {
    cwd: options.cwd,
    additionalDirectories: [tsukumoHomePath("characters")],
    includePartialMessages: true,
    agentProgressSummaries: true,
    systemPrompt: { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
    permissionMode: options.permissionMode,
    model: options.model,
    effort: options.effort,
    resume: options.start.kind === "resume" ? options.start.sessionId : undefined,
    settings: { language: "japanese" },
    env: childProcessEnv(options.inheritedEnv),
    disallowedTools: options.mode.kind === "work" ? [...options.disallowedTools] : [],
    plugins: [
      { type: "local", path: bundledFilePath("plugin") },
      ...(options.mountWorkflowPlugin
        ? [{ type: "local" as const, path: workflowPluginDir() }]
        : []),
      ...(options.mountFigurePlugin ? [{ type: "local" as const, path: figurePluginDir() }] : []),
    ],
  }
}

/**
 * `PreToolUse` フックを、当てるツールごとの matcher に分けて登録する。
 * 読み取り（`Read`・`Grep`・`Glob`・`ToolSearch`）と `phase_result` 以外の tsukumo のツールには、どれも当たらない。
 * 1つのツールに当たった matcher のフックは並んで走り、どれかの `deny` が勝つ。
 *
 * - 委譲ゲート（{@link GATED_TOOL_MATCHER}）: 外部由来の印を立て、委譲ゲート（`judgeToolAgainstGate`）で拒む。
 *   印は結果のフック（{@link postToolUseHooks}）でも立てる
 * - `mcp__tsukumo__phase_result`: メインの呼び出しを拒む（`judgePhaseResultCaller`）
 * - `Edit|Write`: `planMissing` が真のあいだ、メインの呼び出しを拒む（`judgeEditAgainstMissingPlan`。渡さなければ登録しない）
 * - `Agent`: メインの呼び出しを背景に固定する（`updatedInput` だけを返し、許可の判定には触らない）
 * - `Bash`: `command` を `rewriteBash` が返した短い出力の版へ差し替える（同じく `updatedInput` だけ。サブエージェントの中の呼び出しも対象）
 *
 * 委譲ゲートと `phase_result` のフックは、所要を測るために呼ばれた時刻を `hookClock` に控える。
 * `agent_id` はサブエージェント内の呼び出しにだけ付くので、ここで真偽に畳んでから渡す。
 *
 * 委譲ゲートの印を読む前に、拒む側に当たったときだけ1回 macrotask を待つ。
 * 返却を運ぶメッセージは `relayMessages` の反復へ渡るまで列に積まれ、フックの呼び出しはそれより先に処理されうる。
 */
export function preToolUseHooks(
  gateRaised: () => boolean,
  bandPosition: () => string,
  externalToolMark: Pick<ExternalToolMark, "observeTool">,
  rewriteBash: (command: string) => Promise<string | undefined>,
  planMissing: (() => boolean) | undefined,
  hookClock: Pick<ToolHookClock, "started">,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [
      {
        matcher: GATED_TOOL_MATCHER,
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") {
              return {}
            }
            hookClock.started(input.tool_use_id)
            // 背景へ回った（detached の）結果では Claude Code が PostToolUse を呼ばずに結果を返すので、ここでも印を立てる。
            externalToolMark.observeTool(input.tool_name)
            const inSubagent = input.agent_id !== undefined
            if (judgeToolAgainstGate(input.tool_name, inSubagent, "").kind !== "deny") {
              return {}
            }
            await setImmediate()
            const gated = judgeToolAgainstGate(input.tool_name, inSubagent, bandPosition())
            return gated.kind === "deny" && gateRaised() ? deny(gated.reason) : {}
          },
        ],
      },
      {
        matcher: tsukumoToolFullName(PHASE_RESULT_TOOL_NAME),
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") {
              return {}
            }
            hookClock.started(input.tool_use_id)
            const caller = judgePhaseResultCaller(input.tool_name, input.agent_id !== undefined)
            return caller.kind === "deny" ? deny(caller.reason) : {}
          },
        ],
      },
      ...(planMissing === undefined
        ? []
        : [
            {
              matcher: "Edit|Write",
              hooks: [
                async (input: HookInput) => {
                  if (input.hook_event_name !== "PreToolUse" || !planMissing()) {
                    return {}
                  }
                  const edited = judgeEditAgainstMissingPlan(
                    input.tool_name,
                    input.agent_id !== undefined,
                    filePathOf(input.tool_input),
                  )
                  return edited.kind === "deny" ? deny(edited.reason) : {}
                },
              ],
            },
          ]),
      {
        matcher: "Agent",
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") {
              return {}
            }
            const pinned = pinToBackground(
              input.tool_name,
              input.tool_input,
              input.agent_id !== undefined,
            )
            return pinned.kind === "rewrite"
              ? { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: pinned.input } }
              : {}
          },
        ],
      },
      {
        matcher: "Bash",
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") {
              return {}
            }
            const shortened = await rewriteBashCommand(
              input.tool_name,
              input.tool_input,
              rewriteBash,
            )
            return shortened === undefined
              ? {}
              : { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: shortened } }
          },
        ],
      },
    ],
  }
}

/**
 * matcher の無い `PostToolUse` と `PostToolUseFailure` のフックを1つずつ登録する。
 * どちらも、外部由来の印（`ExternalToolMark`）へサブエージェントの中の呼び出しも含めてツール名を渡し、
 * メインの呼び出しでは見届けた設定（{@link confirmedSettingEvents}）を流し、
 * `hookClock` に控えのあるツールでは PreToolUse のフックからツールが走り始めるまでの所要を `diagnose` へ渡す。
 * Claude Code はこのフックが返るのを待ってからツールの結果をモデルへ渡す（`updatedToolOutput` で結果を差し替えられる）ので、
 * 印は結果がモデルへ届くより先に立つ。
 */
export function postToolUseHooks(
  onEvent: (event: SessionEvent) => void,
  externalToolMark: Pick<ExternalToolMark, "observeTool">,
  hookClock: Pick<ToolHookClock, "finished">,
  diagnose: (lap: ToolHookDurationLap) => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const observe = (
    input: BaseHookInput & { readonly tool_name: string; readonly tool_use_id: string },
    hook: ToolHookDurationLap["hook"],
    toolMs: number | undefined,
  ): void => {
    externalToolMark.observeTool(input.tool_name)
    const inSubagent = input.agent_id !== undefined
    if (!inSubagent) {
      confirmedSettingEvents(input).forEach(onEvent)
    }
    if (toolMs === undefined) {
      return
    }
    const lap = hookClock.finished(input.tool_use_id, toolMs)
    if (lap.kind === "measured") {
      diagnose({
        flow: "tool-hook-duration",
        tool: toolHookDurationTool(input.tool_name),
        inSubagent,
        hook,
        beforeToolMs: lap.beforeToolMs,
        toolMs,
      })
    }
  }
  return {
    PostToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === "PostToolUse") {
              observe(input, "PostToolUse", input.duration_ms)
            }
            return {}
          },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === "PostToolUseFailure") {
              observe(input, "PostToolUseFailure", input.duration_ms)
            }
            return {}
          },
        ],
      },
    ],
  }
}

/**
 * `UserPromptSubmit` フックを1つ登録し、委譲先の返却を運ぶメインの入力に、溜めた返却の注記を `additionalContext` で添える。
 * 返却は、メインが手すきでもターンの途中でも `<agent-message` で始まる `prompt` としてこのフックを1回通る。
 * `source` は SDK 0.3.288 の実測で常に undefined なので見ない。
 *
 * 注記を読む前に1回 macrotask を待つ（{@link preToolUseHooks} と同じく、返却を運ぶメッセージが `relayMessages` の反復へ渡るのを待つ）。
 *
 * フックの入力には返却を見分ける欄が無い（SDK 0.3.288 の実測で、`source` も `origin` も来ない）ので、見分けは包みの頭のまま。
 * 頭の合わないメインの入力が届いたときに注記が溜まったままなら、包みの形が変わったとみて `reportHeadMismatch` を呼ぶ（注記は添えない）。
 */
export function handbackNoteHooks(
  review: Pick<CallReview, "takeHandbackNote" | "handbackNotePending">,
  reportHeadMismatch: () => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "UserPromptSubmit" || input.agent_id !== undefined) {
              return {}
            }
            await setImmediate()
            if (!input.prompt.trimStart().startsWith(HANDBACK_PROMPT_HEAD)) {
              if (review.handbackNotePending()) {
                reportHeadMismatch()
              }
              return {}
            }
            const note = review.takeHandbackNote()
            return note === ""
              ? {}
              : {
                  hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: note,
                  },
                }
          },
        ],
      },
    ],
  }
}

/** 委譲先の返却を運ぶメインの入力の頭（Claude Code が返却を包む塊）。 */
const HANDBACK_PROMPT_HEAD = "<agent-message"

/**
 * `Stop` フックを1つ登録する。
 * モードによらず常に登録する。effort を読む口は仕事でも雑談でも要るが、`report` の関所（`createReportGate`）で止めるのは仕事のときだけ。
 * `SubagentStop` には載せない（サブエージェントの `report` は捨てるので、渡し直させても画面に出ない。effort もメインの手元の値だけを読めばよい）。
 *
 * 見届けた設定（{@link confirmedSettingEvents}）はブロック判定より先に読む。
 * 実測は `docs/history/decision.md`「requirements.md 4.1 Claude Code の駆動（スパイクの実測）」。
 *
 * 関所の判定の前に1回だけ macrotask を待つ。
 * SDK はフックの呼び出し（制御リクエスト）を読んだその場で処理し、それより前に届いたメッセージは列に積んで `relayMessages` の反復へ渡す。
 * 待たないと、止まる直前の本文が関所に届く前に判定しうる。
 * 列を空けるのは microtask だけなので、macrotask を1回待てば足りる（雑談のときはこの待ちも関所の判定も行わない）。
 */
export function stopHooks(
  mode: SessionMode,
  gate: ReportGate,
  onEvent: (event: SessionEvent) => void,
  onGateBlock: () => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    Stop: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "Stop") {
              return {}
            }
            confirmedSettingEvents(input).forEach(onEvent)
            if (mode.kind !== "work") {
              return {}
            }
            await setImmediate()
            const verdict = gate.verdict(input.stop_hook_active)
            if (verdict.kind !== "block") {
              return {}
            }
            onGateBlock()
            return { decision: "block", reason: verdict.reason }
          },
        ],
      },
    ],
  }
}

/**
 * フック入力の `effort.level` と `permission_mode` を、見届けた設定（`setting-confirmed`）にする。
 * 知らない値と、無いもの（effort に対応しないモデルでは `effort` ごと来ない）は出さない。
 */
function confirmedSettingEvents(input: BaseHookInput): readonly SessionEvent[] {
  const level = input.effort?.level
  const mode = input.permission_mode
  return [
    ...(level !== undefined && isEffortLevel(level)
      ? [{ kind: "setting-confirmed", setting: "effort", value: level } as const]
      : []),
    ...(mode !== undefined && isPermissionMode(mode)
      ? [{ kind: "setting-confirmed", setting: "permissionMode", value: mode } as const]
      : []),
  ]
}

function deny(reason: string): SyncHookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }
}

function filePathOf(toolInput: unknown): string | undefined {
  if (typeof toolInput !== "object" || toolInput === null || !("file_path" in toolInput)) {
    return undefined
  }
  return typeof toolInput.file_path === "string" ? toolInput.file_path : undefined
}
