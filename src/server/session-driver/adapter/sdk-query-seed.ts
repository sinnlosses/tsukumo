// `query()` に渡す `options` のうち `mcpServers` / `canUseTool`（クロージャが要る）を除いた部分と、
// `Stop` と `PreToolUse` のフックの登録を組み立てる。

import { setImmediate } from "node:timers/promises"

import type {
  HookCallbackMatcher,
  HookEvent,
  SdkPluginConfig,
} from "@anthropic-ai/claude-agent-sdk"

import { type EffortLevel, isEffortLevel, type PermissionMode } from "../../../shared/command.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"
import type { ReportGate } from "../../report/core/report-tool.ts"
import { AGENT_TOOL_NAME, pinToBackground } from "../core/background-delegation.ts"
import type { SessionDriverOptions, SessionMode } from "../core/session-driver.ts"
import { childProcessEnv } from "../core/visible-output-nudge.ts"

/** `query()` の `options` のうち、`mcpServers` / `canUseTool`（クロージャが要る）を除いた部分。 */
export type QuerySeedOptions = {
  readonly cwd: string
  readonly includePartialMessages: true
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
   * ターンの最後の応答が空だと本体が差し込む催促（`[Your previous response had no visible output. ...]`）への返事が、指定なしだと日本語の依頼でも英語に滑るための保険。
   * 値は固定で、キャラクターパックや利用者から変える口は作らない。
   */
  readonly settings: { readonly language: "japanese" }
  /**
   * 子プロセスの環境変数。
   * 渡すと tsukumo 自身の環境と混ざらず丸ごと置き換わるので、引き継いだ環境に本体の催促を止める変数を足したもの（`childProcessEnv`）を渡す。
   */
  readonly env: Readonly<Record<string, string | undefined>>
  /** tsukumo に同梱したプラグイン（`plugin/`。使用量の見直しのスキル `tsukumo:token-usage-diet` を持つ）。 */
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
    includePartialMessages: true,
    systemPrompt: { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
    permissionMode: options.permissionMode,
    model: options.model,
    effort: options.effort,
    resume: options.start.kind === "resume" ? options.start.sessionId : undefined,
    settings: { language: "japanese" },
    env: childProcessEnv(options.inheritedEnv),
    plugins: [{ type: "local", path: bundledFilePath("plugin") }],
  }
}

/**
 * メインの `Agent` 呼び出しを背景に固定する `PreToolUse` フックを登録する。
 * `permissionDecision` は返さない（許可の判定には触らず、`updatedInput` だけで足りる）。
 * `agent_id` はサブエージェント内の呼び出しにだけ付くので、ここで真偽に畳んでから渡す。
 */
export function backgroundDelegationHooks(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [
      {
        matcher: AGENT_TOOL_NAME,
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
    ],
  }
}

/**
 * `Stop` フックを1つ登録する。
 * モードによらず常に登録する。effort を読む口は仕事でも雑談でも要るが、`report` の関所（`createReportGate`）で止めるのは仕事のときだけ。
 * `SubagentStop` には載せない（サブエージェントの `report` は捨てるので、渡し直させても画面に出ない。effort もメインの手元の値だけを読めばよい）。
 *
 * effort はブロック判定より先に読む。
 * `input.effort?.level` が {@link isEffortLevel} を通れば `effort-changed` を流す。
 * 帯に表示する値の源はここだけ（実測は `docs/history/decision.md`「effort の途中変更と読み取りが成り立った実測」）。
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
            const level = input.effort?.level
            if (level !== undefined && isEffortLevel(level)) {
              onEvent({ kind: "effort-changed", effort: level })
            }
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
