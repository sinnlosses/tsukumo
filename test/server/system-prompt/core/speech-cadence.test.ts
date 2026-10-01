import { describe, expect, it } from "vitest"

import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../../src/server/system-prompt/core/speech-cadence.ts"
import { takeSystemPromptAppend } from "../../../../src/server/system-prompt/core/system-prompt.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { fixedChatSummary, NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"

// この規約はパックによらず同じもの（docs/architecture/display.md「表示」）。文面そのものではなく、
// どのパックの append にも載ることを見る（人格が無いパックで落ちると、そのパックだけ
// 吹き出しが止まる）。並びそのものの正典は `takeSystemPromptAppend`
// （人格との前後関係と、人格が無いパックで規約だけになることは、そちらが append 全体の文字列
// として固定している。組み立てをそこへ寄せたときに、同じ分岐の重複としてここから外した）。

const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

/** 仕事モードの append（人格は文字列で渡す。`takeSystemPromptAppend`）。 */
function workAppend(persona: string): string {
  return takeSystemPromptAppend({
    persona,
    mode: {
      kind: "work",
      memory: {
        chatSummary: fixedChatSummary(undefined),
        chatArchive: NOOP_CHAT_ARCHIVE,
        packName: "架空",
        readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes },
      },
    },
  })
}

describe("SPEECH_CADENCE_PROMPT", () => {
  it("話す頻度を持つのはこちらで、レポートの記法の側には無い", () => {
    // 正典を2つにしない（persona.md からも移した）。
    expect(SPEECH_CADENCE_PROMPT).toContain("作業が長いターンほど間を空けない")
    expect(REPORT_NOTATION_PROMPT).not.toContain("間を空けない")
  })

  it("締めの1回は speak ではなく report の closing で言う", () => {
    // 通った `report` はそこでターンを閉じるので、あとから `speak` は呼べない
    // （`REPORT_NOTATION_PROMPT` の終わり方の条と揃える）。
    expect(SPEECH_CADENCE_PROMPT).toContain(
      "締めの1回は `speak` ではなく `report` の `closing` で言う",
    )
    expect(SPEECH_CADENCE_PROMPT).not.toContain("`report` を呼んだ直後に締めの1回")
    expect(SPEECH_CADENCE_PROMPT).not.toContain("書く直前")
    expect(SPEECH_CADENCE_PROMPT).not.toContain("これから何を書くかの予告")
  })

  it("委譲中の間合い（背景委譲・合図の形式）を持ち、append に載る", () => {
    // 文面の全文は写さず、決めた4点（背景委譲・間隔・合図の形式）が入っているかだけを見る
    // （フォアグラウンドの委譲は吹き出しを数分止める）。
    const append = workAppend(PERSONA)

    expect(SPEECH_CADENCE_PROMPT).toContain("run_in_background")
    expect(SPEECH_CADENCE_PROMPT).toContain("状況 | n/N")
    expect(SPEECH_CADENCE_PROMPT).toContain("work_plan")
    expect(append).toContain("run_in_background")
  })

  it("合図の届いていないターンでは speak も report も呼ばず、何も書かずに終える", () => {
    expect(SPEECH_CADENCE_PROMPT).toContain(
      "合図（進み具合の1行か、委譲の完了の知らせ）の届いていないターン",
    )
    expect(SPEECH_CADENCE_PROMPT).toContain("The user hasn't heard from you in a while")
    expect(SPEECH_CADENCE_PROMPT).toContain("何も書かずに終える")
  })
})
