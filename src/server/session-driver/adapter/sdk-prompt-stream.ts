// SDK へ渡す依頼のストリーミング入力。依頼が届くたびに user メッセージを1つ流す。
// 流す依頼には利用者の入力の印（`origin: { kind: "human" }`）を付ける。復元はこの欄で依頼を見分ける。

import type { UUID } from "node:crypto"

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import type { PromptDelayWatch } from "../core/prompt-delay.ts"

/**
 * 送る依頼1件。
 * 駆動が持つ原寸の画像はここまでで、`stream()` が渡したあとは持たない（拡大表示のために残すのは棚の側）。
 */
export type Prompt = {
  readonly text: string
  readonly images: readonly PromptContentBlock[]
  /** 流す user メッセージの `uuid`。transcript の行の `uuid` にそのまま入り、入力の控えの鍵になる。 */
  readonly uuid: UUID
}

/** user メッセージの内容ブロック1つ。`MessageParam` の型をそのまま使う（自前の型を作らない）。 */
export type PromptContentBlock = Extract<
  SDKUserMessage["message"]["content"],
  readonly unknown[]
>[number]

/**
 * ストリーミング入力。
 * `query` には「まだ終わらない」非同期イテレータを渡し、依頼が届くたびに user メッセージを1つ流す。
 *
 * 画像を添えられるのはストリーミング入力だけ（単発入力は受け付けない）。
 * 添えたときは `content` を配列にし、画像のブロックを先に、文面を後ろに置く。
 */
export function createPromptStream(
  delayWatch: PromptDelayWatch,
  now: () => number,
): {
  readonly push: (prompt: Prompt) => void
  readonly end: () => void
  readonly stream: () => AsyncIterable<SDKUserMessage>
} {
  const waiting: Prompt[] = []
  let wake: (() => void) | undefined = undefined
  let closed = false

  const notify = (): void => {
    const resume = wake
    wake = undefined
    resume?.()
  }

  return {
    push: (prompt) => {
      waiting.push(prompt)
      notify()
    },
    end: () => {
      closed = true
      notify()
    },
    stream: async function* () {
      while (true) {
        const prompt = waiting.shift()
        if (prompt === undefined) {
          if (closed) {
            return
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }

        yield {
          type: "user",
          message: { role: "user", content: promptContent(prompt) },
          parent_tool_use_id: null,
          session_id: "",
          origin: { kind: "human" },
          uuid: prompt.uuid,
        }
        delayWatch.written(now())
      }
    },
  }
}

/** 依頼1件の `content`。画像が無ければ文字列のまま。 */
function promptContent(prompt: Prompt): SDKUserMessage["message"]["content"] {
  return prompt.images.length === 0
    ? prompt.text
    : [...prompt.images, { type: "text", text: prompt.text }]
}
