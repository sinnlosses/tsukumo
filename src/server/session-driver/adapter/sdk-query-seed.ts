// `query()` に渡す `options` のうち `mcpServers` / `canUseTool`（クロージャが要る）を除いた部分と、
// `Stop` と `PreToolUse` のフックの登録を組み立てる。

import { join } from "node:path"
import { setImmediate } from "node:timers/promises"

import type {
  BaseHookInput,
  HookCallbackMatcher,
  HookEvent,
  SdkPluginConfig,
} from "@anthropic-ai/claude-agent-sdk"

import {
  type EffortLevel,
  isEffortLevel,
  isPermissionMode,
  type PermissionMode,
} from "../../../shared/command.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { ReportGate } from "../../report/core/report-tool.ts"
import { pinToBackground } from "../core/background-delegation.ts"
import { rewriteBashCommand } from "../core/bash-command-rewrite.ts"
import type { ExternalToolMark } from "../core/external-tool-mark.ts"
import { judgePhaseResultCaller } from "../core/phase-result-tool.ts"
import type { SessionDriverOptions, SessionMode } from "../core/session-driver.ts"
import { childProcessEnv } from "../core/visible-output-nudge.ts"
import { judgeToolAgainstGate } from "../core/work-plan-gate.ts"
import { workflowPluginDir } from "./workflow-plugin.ts"

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
  /** セッションに載せるプラグイン。同梱の `plugin/`（`tsukumo:token-usage-diet`）と、取り込んだ tsukumo-plugins（`mountWorkflowPlugin` のときだけ）。 */
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
    additionalDirectories: [join(tsukumoHomeDir(), "characters")],
    includePartialMessages: true,
    agentProgressSummaries: true,
    systemPrompt: { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
    permissionMode: options.permissionMode,
    model: options.model,
    effort: options.effort,
    resume: options.start.kind === "resume" ? options.start.sessionId : undefined,
    settings: { language: "japanese" },
    env: childProcessEnv(options.inheritedEnv),
    plugins: [
      { type: "local", path: bundledFilePath("plugin") },
      ...(options.mountWorkflowPlugin
        ? [{ type: "local" as const, path: workflowPluginDir() }]
        : []),
    ],
  }
}

/**
 * `PreToolUse` フックを1つ登録する。
 * メインの `phase_result`（`judgePhaseResultCaller`）と、委譲ゲート（`judgeToolAgainstGate`）で拒むときは `permissionDecision: "deny"` を返す。
 * 通したメインの `Agent` 呼び出しは背景に固定する（`updatedInput` だけを返し、許可の判定には触らない）。
 * `Bash` の `command` は `rewriteBash` が返した短い出力の版へ差し替える（同じく `updatedInput` だけ。サブエージェントの中の呼び出しも対象）。
 * `agent_id` はサブエージェント内の呼び出しにだけ付くので、ここで真偽に畳んでから渡す。
 *
 * 印を読む前に、拒む側に当たったときだけ1回 macrotask を待つ。
 * 返却を運ぶメッセージは `relayMessages` の反復へ渡るまで列に積まれ、フックの呼び出しはそれより先に処理されうる。
 *
 * 外部由来の印（`ExternalToolMark`）へのツール名は、拒むかどうかを決める前に、サブエージェントの中の呼び出しも含めて渡す。
 */
export function preToolUseHooks(
  gateRaised: () => boolean,
  bandPosition: () => string,
  onEvent: (event: SessionEvent) => void,
  externalToolMark: Pick<ExternalToolMark, "observeTool">,
  rewriteBash: (command: string) => Promise<string | undefined>,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") {
              return {}
            }
            externalToolMark.observeTool(input.tool_name)
            const inSubagent = input.agent_id !== undefined
            if (!inSubagent) {
              confirmedSettingEvents(input).forEach(onEvent)
            }
            const caller = judgePhaseResultCaller(input.tool_name, inSubagent)
            if (caller.kind === "deny") {
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: "deny",
                  permissionDecisionReason: caller.reason,
                },
              }
            }
            if (judgeToolAgainstGate(input.tool_name, inSubagent, "").kind === "deny") {
              await setImmediate()
              const gated = judgeToolAgainstGate(input.tool_name, inSubagent, bandPosition())
              if (gated.kind === "deny" && gateRaised()) {
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: gated.reason,
                  },
                }
              }
            }
            const pinned = pinToBackground(input.tool_name, input.tool_input, inSubagent)
            if (pinned.kind === "rewrite") {
              return {
                hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: pinned.input },
              }
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
 * `UserPromptSubmit` フックを1つ登録し、委譲先の返却を運ぶメインの入力に、溜めた返却の注記を `additionalContext` で添える。
 * 返却は、メインが手すきでもターンの途中でも `<agent-message` で始まる `prompt` としてこのフックを1回通る。
 * `source` は SDK 0.3.288 の実測で常に undefined なので見ない。
 *
 * 注記を読む前に1回 macrotask を待つ（{@link preToolUseHooks} と同じく、返却を運ぶメッセージが `relayMessages` の反復へ渡るのを待つ）。
 */
export function handbackNoteHooks(
  takeHandbackNote: () => string,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          async (input) => {
            if (
              input.hook_event_name !== "UserPromptSubmit" ||
              input.agent_id !== undefined ||
              !input.prompt.trimStart().startsWith(HANDBACK_PROMPT_HEAD)
            ) {
              return {}
            }
            await setImmediate()
            const note = takeHandbackNote()
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
 * 実測は `docs/history/decision.md`「effort の途中変更と読み取りが成り立った実測」。
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
            return verdict.kind === "block" ? { decision: "block", reason: verdict.reason } : {}
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
