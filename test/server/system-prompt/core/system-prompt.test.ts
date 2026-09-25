import { describe, expect, it } from "bun:test"

import { CHAT_MANNER_PROMPT } from "../../../../src/server/core/chat-manner.ts"
import { takeChatMemoryPromptParts } from "../../../../src/server/core/chat-memory-prompt.ts"
import {
  type ChatArchive,
  type ChatArchiveRecentEntry,
  type ChatSummary,
  type ChatSummaryRecord,
  type SessionStart,
} from "../../../../src/server/core/session-driver.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../../src/server/system-prompt/core/speech-cadence.ts"
import {
  type SystemPromptMode,
  takeSystemPromptAppend,
} from "../../../../src/server/system-prompt/core/system-prompt.ts"

// **`systemPrompt` に何が・どの順で載るか**を、3通り（仕事・雑談・続きから始めるとき）で固定する
// （docs/design.md 7章）。**本物の駆動を起こして確かめることはできない**（`systemPrompt` は
// セッションを起こすときに固定され、あとから覗けない）ので、組み立ての側を見る。
//
// **文面そのものは写さない。** 節の中身の正典は `report-notation.ts` / `speech-cadence.ts` /
// `chat-manner.ts` / `chat-memory-prompt.ts` で、ここが見るのは**並びとつなぎ方**だけ。
// 期待値の見出しは定数から取り出す（文面を直してもここは二重にならない）。**雑談の記憶の3節だけ
// 見出しを直に書く**——前置きは `chat-memory-prompt.ts` の外に出ておらず、ここで見たいのが
// 「どのモードで、どの順に載るか」の表そのものだから。

/** 人格・要約・会話は手で書いた架空のものだけ（docs/coding-standards.md「会話内容の扱い」）。 */
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"
const SUMMARY = "架空の精霊と読んだ本の話をした。"
const KEPT: readonly ChatArchiveRecentEntry[] = [
  { speaker: "user", text: "この話は覚えておいて", date: "2026-09-20" },
]
const RECENT: readonly ChatArchiveRecentEntry[] = [
  { speaker: "user", text: "ただいま", date: "2026-09-21" },
  { speaker: "character", text: "おかえりなのじゃ", date: "2026-09-21" },
]

describe("takeSystemPromptAppend", () => {
  it("仕事のときは 人格 → セリフの間合い → レポートの記法 の順でつながる", () => {
    const append = takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })

    expect(append).toBe(`${PERSONA}\n\n${SPEECH_CADENCE_PROMPT}\n\n${REPORT_NOTATION_PROMPT}`)
  })

  it("雑談のときは 人格 → 雑談の作法 → 雑談の記憶 の順でつながる（仕事の2つは載らない）", () => {
    const summary = fakeChatSummary({ summary: SUMMARY, delivered: false })
    const archive = fakeChatArchive()
    const expectedMemory = takeChatMemoryPromptParts({
      start: { kind: "new" },
      chatSummary: fakeChatSummary({ summary: SUMMARY, delivered: false }),
      chatArchive: archive,
      packName: "架空",
      readbackLimits: { recentBytes: 65_536, keptBytes: 8_192 },
    })

    const append = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode({ kind: "new" }, summary, archive),
    })

    expect(append).toBe([PERSONA, CHAT_MANNER_PROMPT, ...expectedMemory].join("\n\n"))
    expect(append).not.toContain(REPORT_NOTATION_PROMPT)
    expect(append).not.toContain(SPEECH_CADENCE_PROMPT)
  })

  it("続きから始めて写しが渡し済みなら、雑談の記憶は載らない（人格 → 雑談の作法 だけ）", () => {
    const summary = fakeChatSummary({ summary: SUMMARY, delivered: true })

    const append = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode({ kind: "resume", sessionId: "fictional" }, summary, fakeChatArchive()),
    })

    expect(append).toBe(`${PERSONA}\n\n${CHAT_MANNER_PROMPT}`)
  })

  it("3通りの節の並びは、仕事・雑談・続きからで入れ替わる", () => {
    const work = takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })
    const chat = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode(
        { kind: "new" },
        fakeChatSummary({ summary: SUMMARY, delivered: false }),
        fakeChatArchive(),
      ),
    })
    const resumed = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode(
        { kind: "resume", sessionId: "fictional" },
        fakeChatSummary({ summary: SUMMARY, delivered: true }),
        fakeChatArchive(),
      ),
    })

    expect(headings(work)).toEqual([
      ...headings(PERSONA),
      ...headings(SPEECH_CADENCE_PROMPT),
      ...headings(REPORT_NOTATION_PROMPT),
    ])
    expect(headings(chat)).toEqual([
      ...headings(PERSONA),
      ...headings(CHAT_MANNER_PROMPT),
      "## 前回までの雑談の要約",
      "## 残すと決めた雑談（そのままの文面）",
      "## 直近の雑談（そのままの文面）",
    ])
    expect(headings(resumed)).toEqual([...headings(PERSONA), ...headings(CHAT_MANNER_PROMPT)])
  })

  it("人格が無いパック（空文字列）でも規約は載る（どのパックでも黙りっぱなしにしない）", () => {
    const append = takeSystemPromptAppend({ persona: "", mode: { kind: "work" } })

    expect(append).toBe(`${SPEECH_CADENCE_PROMPT}\n\n${REPORT_NOTATION_PROMPT}`)
  })

  it("どちらのモードでも人格は載る（パックの口調は雑談でも変わらない）", () => {
    const chat = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode(
        { kind: "new" },
        fakeChatSummary({ summary: SUMMARY, delivered: false }),
        fakeChatArchive(),
      ),
    })

    expect(takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })).toContain(PERSONA)
    expect(chat).toContain(PERSONA)
  })

  it("雑談の記憶を載せたら写しの印は「渡し済み」に戻る（名前の `take` はこの副作用）", () => {
    const summary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode({ kind: "new" }, summary, fakeChatArchive()),
    })

    expect(summary.read()?.delivered).toBe(true)
  })

  it("雑談のときだけ載る条（覚える・忘れる・残す）は、仕事の append に入らない", () => {
    // 2つのツールは雑談のときだけ載るので、呼ぶ条件もこの文面だけが持つ
    // （docs/design.md 7.1・docs/chat-mode.md 4.9）。
    const work = takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })

    expect(CHAT_MANNER_PROMPT).toContain("remember")
    expect(CHAT_MANNER_PROMPT).toContain("forget")
    expect(CHAT_MANNER_PROMPT).toContain("keep")
    expect(work).not.toContain("forget")
    expect(work).not.toContain("keep")
  })

  it("雑談の作法に「完了」の1行の条は無い（催促は環境変数で塞ぐ。docs/chat-mode.md 4.9）", () => {
    expect(CHAT_MANNER_PROMPT).not.toContain("「完了」")
  })

  it("雑談の作法は口調を決めない（口調はキャラクターパックの persona.md の担当）", () => {
    // 正典を2つにしない（`report-notation.ts` と同じ切り分け。docs/chat-mode.md 4.9）。
    expect(CHAT_MANNER_PROMPT).toContain("speak")
    expect(CHAT_MANNER_PROMPT).not.toContain("一人称")
  })
})

/** 雑談のモード（記憶の口は呼ぶたびに作る。読む量は本物の配線と同じ値）。 */
function chatMode(
  start: SessionStart,
  chatSummary: ChatSummary,
  chatArchive: ChatArchive,
): SystemPromptMode {
  return {
    kind: "chat",
    memory: {
      start,
      chatSummary,
      chatArchive,
      packName: "架空",
      readbackLimits: { recentBytes: 65_536, keptBytes: 8_192 },
    },
  }
}

/** メモリ上の `ChatSummary`（テスト用）。 */
function fakeChatSummary(initial: ChatSummaryRecord): ChatSummary {
  let record = initial
  return {
    read: () => record,
    write: (summary) => {
      record = { summary, delivered: true }
    },
    markUndelivered: () => {
      record = { summary: record.summary, delivered: false }
    },
    markDelivered: () => {
      record = { summary: record.summary, delivered: true }
    },
  }
}

/** メモリ上の `ChatArchive`（テスト用）。読み戻しは架空の2往復を返すだけ。 */
function fakeChatArchive(): ChatArchive {
  return {
    append: () => {},
    keep: () => {},
    finishTurn: () => {},
    writeIndex: () => {},
    recall: () => ({ kind: "not-found" }),
    readRecent: () => ({ kept: KEPT, recent: RECENT }),
  }
}

/** 節の見出しの並び（`# ` と `## ` で始まる行）。逐語に挟まる日付は `### ` なので入らない。 */
function headings(text: string): readonly string[] {
  return text.split("\n").filter((line) => /^#{1,2} /.test(line))
}
