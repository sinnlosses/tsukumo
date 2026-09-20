// tsukumo がセッションに足す規約を、**モードに応じて選ぶ**（`docs/requirements.md` 4.9）。
// 文面そのものは {@link ./report-notation.ts} / {@link ./speech-cadence.ts} /
// {@link ./chat-manner.ts} が持ち、ここが決めるのは**どれを渡すか**だけ。
//
// **なぜ `src/cli.ts` の中に書かないのか**: 雑談のときに何が載って何が載らないかは
// 体験そのものの決めごとで、配線の都合ではない。`cli.ts` に直書きすると、選び方を
// 確かめるのに本物の駆動を起こすしかなくなる（`systemPrompt` はセッションを起こすときに
// 固定されるため、あとから覗けない）。
//
// 「決める」内容で、外の世界には触らない（原則2）。`buildSystemPromptAppend` に通して
// `query()` へ渡すのは呼び出し側（`src/cli.ts`）。

import { CHAT_MANNER_PROMPT } from "./chat-manner.ts"
import { REPORT_NOTATION_PROMPT } from "./report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "./speech-cadence.ts"

/**
 * セッションに足す規約を、雑談かどうかで選ぶ（並び順のまま append に載る）。
 *
 * **雑談のときは仕事の2つと入れ替える**（並べない）。片方が「本文は中立・簡潔に」と言い、
 * もう片方が「本文を書くな」と言う形になり、どちらが効くかが揺れるため。セリフの間合いも
 * 仕事向け（ツールの前後に1回）で、往復そのものが会話になる雑談では意味をなさない
 * （理由の正典は {@link ./chat-manner.ts} の冒頭）。
 */
export function sessionRules(chat: boolean): readonly string[] {
  return chat ? [CHAT_MANNER_PROMPT] : [SPEECH_CADENCE_PROMPT, REPORT_NOTATION_PROMPT]
}
