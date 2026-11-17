// メインの入力に、溜めた返却の注記といまの様子を添える `UserPromptSubmit` フックの登録。

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import type { PresentSceneKind } from "../../../../shared/diagnostic/present-scene.ts"
import type { CallReview } from "../../core/call-review.ts"
import {
  createPresentSceneKeeper,
  type PresentSceneKeeper,
} from "../../core/present-scene-keeper.ts"
import type { SessionMode } from "../../core/session-driver.ts"
import { waitForQueuedMessages } from "./queued-message-wait.ts"

/**
 * `UserPromptSubmit` フックを1つ登録し、メインの入力に `additionalContext` を添える。
 * ふつうの依頼・補足・tsukumo の差し込みも、委譲先の返却も、このフックを1回通る（SDK 0.3.326 の実測。ふつうの依頼でも `agent_id` も `source` も来ない）。
 * 返却は、メインが手すきでもターンの途中でも `<agent-message` で始まる `prompt` として届く。
 * `source` は SDK 0.3.288 の実測で常に undefined なので見ない。
 *
 * 注記を読む前に {@link waitForQueuedMessages} で待つ。
 *
 * フックの入力には返却を見分ける欄が無い（SDK 0.3.288 の実測で、`source` も `origin` も来ない）ので、見分けは包みの頭のまま。
 * 頭の合わないメインの入力が届いたときに注記が溜まったままなら、包みの形が変わったとみて `reportHeadMismatch` を呼ぶ（注記は添えない）。
 * いまの様子（`takePresentScene`）は入力の種類を見分けずに取り出し、返却の注記があればその後ろに空行でつなぐ。
 * サブエージェントの中の入力では、どちらも取り出さない。
 */
export function handbackNoteHooks(
  review: Pick<CallReview, "takeHandbackNote" | "handbackNotePending">,
  reportHeadMismatch: () => void,
  takePresentScene: () => Promise<string>,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "UserPromptSubmit" || input.agent_id !== undefined) {
              return {}
            }
            await waitForQueuedMessages()
            const note = takeHandbackNoteFor(input.prompt, review, reportHeadMismatch)
            const context = [note, await takePresentScene()]
              .filter((part) => part !== "")
              .join("\n\n")
            return context === ""
              ? {}
              : {
                  hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: context,
                  },
                }
          },
        ],
      },
    ],
  }
}

/** 仕事なら材料を控える控え役、雑談なら何も控えず常に空文字列を返す控え役。 */
export function presentSceneKeeperOf(
  mode: SessionMode,
  now: () => number,
  notify: (kinds: readonly PresentSceneKind[]) => void,
): PresentSceneKeeper {
  if (mode.kind === "work") {
    return createPresentSceneKeeper(mode.presentSceneSource, now, notify)
  }
  return {
    observe: () => {},
    notePlanUsage: () => {},
    take: () => Promise.resolve(""),
  }
}

/** 委譲先の返却（`<agent-message`）とワークフロースクリプトの完了の知らせ（`<task-notification`）を運ぶメインの入力の頭（Claude Code が包む塊）。 */
const HANDBACK_PROMPT_HEADS = ["<agent-message", "<task-notification"]

/** 頭が返却の包みなら溜めた注記を取り出す。合わなければ空文字列で、注記が溜まったままなら知らせる。 */
function takeHandbackNoteFor(
  prompt: string,
  review: Pick<CallReview, "takeHandbackNote" | "handbackNotePending">,
  reportHeadMismatch: () => void,
): string {
  if (HANDBACK_PROMPT_HEADS.some((head) => prompt.trimStart().startsWith(head))) {
    return review.takeHandbackNote()
  }
  if (review.handbackNotePending()) {
    reportHeadMismatch()
  }
  return ""
}
