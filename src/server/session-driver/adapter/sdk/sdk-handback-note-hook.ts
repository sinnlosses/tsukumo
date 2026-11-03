// 委譲先の返却を運ぶメインの入力に、溜めた返却の注記を添える `UserPromptSubmit` フックの登録。

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import type { CallReview } from "../../core/call-review.ts"
import { waitForQueuedMessages } from "./queued-message-wait.ts"

/**
 * `UserPromptSubmit` フックを1つ登録し、委譲先の返却を運ぶメインの入力に、溜めた返却の注記を `additionalContext` で添える。
 * 返却は、メインが手すきでもターンの途中でも `<agent-message` で始まる `prompt` としてこのフックを1回通る。
 * `source` は SDK 0.3.288 の実測で常に undefined なので見ない。
 *
 * 注記を読む前に {@link waitForQueuedMessages} で待つ。
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
            await waitForQueuedMessages()
            if (!HANDBACK_PROMPT_HEADS.some((head) => input.prompt.trimStart().startsWith(head))) {
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

/** 委譲先の返却（`<agent-message`）とワークフロースクリプトの完了の知らせ（`<task-notification`）を運ぶメインの入力の頭（Claude Code が包む塊）。 */
const HANDBACK_PROMPT_HEADS = ["<agent-message", "<task-notification"]
