// claude に渡す `systemPrompt` の append を組み立てる（`docs/design.md` 7章）。**人格・tsukumo 側の
// 規約・雑談の記憶が、どのモードのときに、どの順で入るか**は、このファイルだけを読めば分かる。
//
// **組み立てはこの1ファイルに寄せてある。** 以前は並べる順を配線層（`src/session-start.ts`）が、
// モードごとの選び方を `core/session-rule.ts` が、人格との連結を `adapter/character-pack.ts` が
// 持っていて、全体の並びを知るのに3つのファイルを渡り歩く必要があった（経緯は
// `docs/architecture.md`「新しいコードを置く場所」）。
//
// **文面そのものは持たない。** 規約は {@link ./speech-cadence.ts} / {@link ./report-notation.ts} /
// {@link ./chat-manner.ts} が、雑談の記憶の読み戻しは {@link ./chat-memory-prompt.ts} が持ち、
// ここが決めるのは**どれを・どの順で並べるか**だけ。
//
// **人格（`persona.md` の全文）は文字列で受け取る。** ファイルを読むのは adapter
// （`character-pack.ts`）で、ここはパックの型も fs も知らない——`core` からパックの判断が要る
// ようになったら、層を写した `core/character-pack.ts` ではなく概念で切る
// （`docs/architecture.md`「新しいコードを置く場所」）。

import { CHAT_MANNER_PROMPT } from "./chat-manner.ts"
import { type ChatMemorySources, takeChatMemoryPromptParts } from "./chat-memory-prompt.ts"
import { REPORT_NOTATION_PROMPT } from "./report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "./speech-cadence.ts"

/** {@link takeSystemPromptAppend} に渡すもの。 */
export type SystemPromptSeed = {
  /**
   * 人格（`persona.md` の全文）。**無いパックは空文字列で渡す**（「無い」は入口で畳む）。
   * 空の節は並びから落ちるだけなので、そのパックは tsukumo 側の規約だけで起動する
   * （`docs/design.md` 7章）。
   */
  readonly persona: string
  /** 仕事か雑談か。**雑談のときだけ記憶の口が要る**ので、2つで1つの合併型にしてある。 */
  readonly mode: SystemPromptMode
}

/**
 * どのモードで起こすか。`kind` は `SessionMode`（`./session-driver.ts`）と同じ語で、こちらは
 * **`systemPrompt` を組むのに要るものだけ**を持つ（ツールの口は持たない）。
 */
export type SystemPromptMode =
  | { readonly kind: "work" }
  | {
      readonly kind: "chat"
      /** 雑談の記憶（要約の写しと逐語）の読み戻し口と条件。 */
      readonly memory: ChatMemorySources
    }

/**
 * `systemPrompt` の append を組み立てる。**人格 → tsukumo 側の規約 → 雑談の記憶**の順で、
 * 空の節は落として `\n\n` でつなぐ。規約（機械的な決まりごと）を人格の後ろに置くのは、
 * 人格の文章に埋もれさせないため（`docs/design.md` 7章）。
 *
 * 並びはモードで入れ替わる:
 *
 * | 場面                     | 節の並び                                                                     |
 * | ------------------------ | ---------------------------------------------------------------------------- |
 * | 仕事                     | 人格 → セリフの間合い → レポートの記法                                       |
 * | 雑談（記憶が載るとき）   | 人格 → 雑談の作法 → 前回までの要約 → 残すと決めた雑談 → 直近の雑談           |
 * | 雑談（続きから・渡し済） | 人格 → 雑談の作法                                                            |
 *
 * **雑談のときは仕事の2つと入れ替える**（並べない）。片方が「本文は中立・簡潔に」と言い、
 * もう片方が「本文を書くな」と言う形になり、どちらが効くかが揺れるため。セリフの間合いも
 * 仕事向け（ツールの前後に1回）で、往復そのものが会話になる雑談では意味をなさない
 * （理由の正典は {@link ./chat-manner.ts} の冒頭）。
 *
 * **名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから**
 * （{@link takeChatMemoryPromptParts}。雑談で記憶を載せたとき、印が「渡し済み」に戻る）。
 * 取得に見える名前にすると、呼ぶ側が副作用に気づけない。
 */
export function takeSystemPromptAppend(seed: SystemPromptSeed): string {
  return [seed.persona, ...modeParts(seed.mode)].filter((part) => part.trim() !== "").join("\n\n")
}

/**
 * そのモードで載る、人格より後ろの節（並び順のまま append に載る）。**雑談の記憶を載せるかどうか
 * （新規か・写しの印が未渡しか）の判断は {@link takeChatMemoryPromptParts} が閉じている**ので、
 * ここはモードの分岐だけを持つ。
 */
function modeParts(mode: SystemPromptMode): readonly string[] {
  if (mode.kind === "work") {
    return [SPEECH_CADENCE_PROMPT, REPORT_NOTATION_PROMPT]
  }
  return [CHAT_MANNER_PROMPT, ...takeChatMemoryPromptParts(mode.memory)]
}
