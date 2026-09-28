// claude に渡す `systemPrompt` の append を組み立てる。
// 人格・tsukumo 側の規約・雑談の記憶が、どのモードのときに、どの順で入るかは、このファイルだけを読めば分かる（並べ方を他のファイルへ散らさない）。
//
// 文面そのものは持たない。
// 規約は `SPEECH_CADENCE_PROMPT` / `REPORT_NOTATION_PROMPT` / `CHAT_MANNER_PROMPT` が、雑談の記憶の読み戻しは `takeChatMemoryPromptParts` が持ち、ここが決めるのはどれを・どの順で並べるかだけ。
//
// 人格（`persona.md` の全文）は文字列で受け取り、パックの型も fs も知らない。

import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import { CHAT_MANNER_PROMPT } from "../../chat/core/chat-manner.ts"
import {
  type ChatMemorySources,
  takeChatMemoryPromptParts,
} from "../../chat/core/chat-memory-prompt.ts"
import { REPORT_NOTATION_PROMPT } from "../../report/core/report-notation.ts"
import type {
  ChatArchive,
  SessionMode,
  SessionStart,
} from "../../session-driver/core/session-driver.ts"
import { SPEECH_CADENCE_PROMPT } from "./speech-cadence.ts"

/** {@link takeSystemPromptAppend} に渡すもの。 */
export type SystemPromptSeed = {
  /**
   * 人格（`persona.md` の全文）。無いパックは空文字列で渡す。
   * 空の節は並びから落ちるだけなので、そのパックは tsukumo 側の規約だけで起動する。
   */
  readonly persona: string
  /** 仕事か雑談か。雑談のときだけ記憶の口が要るので、2つで1つの合併型にしてある。 */
  readonly mode: SystemPromptMode
}

/**
 * どのモードで起こすか。`kind` は `SessionMode` と同じ語で、こちらは `systemPrompt` を組むのに要るものだけを持つ（ツールの口は持たない）。
 */
export type SystemPromptMode =
  | { readonly kind: "work" }
  | {
      readonly kind: "chat"
      /** 雑談の記憶（要約の写しと逐語）の読み戻し口と条件。 */
      readonly memory: ChatMemorySources
    }

/**
 * 駆動の `SessionMode` を、`systemPrompt` を組むのに要る形（{@link SystemPromptMode}）へ変える。
 * 雑談のときだけ記憶の口を束ねる。ここがするのは口を渡すことと、読む量を縛ることだけ。
 */
export function toSystemPromptMode(
  mode: SessionMode,
  chatArchive: ChatArchive,
  start: SessionStart,
  packName: string,
): SystemPromptMode {
  if (mode.kind !== "chat") {
    return { kind: "work" }
  }

  return {
    kind: "chat",
    memory: {
      start,
      chatSummary: mode.chatSummary,
      chatArchive,
      packName,
      readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.recentBytes },
    },
  }
}

/**
 * `systemPrompt` の append を組み立てる。人格 → tsukumo 側の規約 → 雑談の記憶の順で、空の節は落として `\n\n` でつなぐ。
 * 規約（機械的な決まりごと）を人格の後ろに置くのは、人格の文章に埋もれさせないため。
 *
 * 並びはモードで入れ替わる:
 *
 * | 場面                     | 節の並び                                          |
 * | ------------------------ | -------------------------------------------------- |
 * | 仕事                     | 人格 → セリフの間合い → レポートの記法             |
 * | 雑談（記憶が載るとき）   | 人格 → 雑談の作法 → 前回までの要約 → 直近の雑談    |
 * | 雑談（続きから・渡し済） | 人格 → 雑談の作法                                  |
 *
 * 雑談のときは仕事の2つと入れ替える（並べない。理由は `CHAT_MANNER_PROMPT` の冒頭）。
 *
 * 名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから（雑談で記憶を載せたとき、印が「渡し済み」に戻る）。
 */
export function takeSystemPromptAppend(seed: SystemPromptSeed): string {
  return [seed.persona, ...modeParts(seed.mode)].filter((part) => part.trim() !== "").join("\n\n")
}

/**
 * そのモードで載る、人格より後ろの節（並び順のまま append に載る）。
 * 雑談の記憶を載せるかどうかの判断は {@link takeChatMemoryPromptParts} が閉じているので、ここはモードの分岐だけを持つ。
 */
function modeParts(mode: SystemPromptMode): readonly string[] {
  if (mode.kind === "work") {
    return [SPEECH_CADENCE_PROMPT, REPORT_NOTATION_PROMPT]
  }
  return [CHAT_MANNER_PROMPT, ...takeChatMemoryPromptParts(mode.memory)]
}
