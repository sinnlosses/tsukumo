import { describe, expect, it } from "vitest"

import { CHAT_MANNER_PROMPT } from "../../../../src/server/chat/core/chat-manner.ts"
import { takeChatMemoryPromptParts } from "../../../../src/server/chat/core/chat-memory-prompt.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import type {
  ChatArchive,
  ChatArchiveRecentEntry,
  ChatSummary,
  SessionMode,
  SessionStart,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../../src/server/system-prompt/core/speech-cadence.ts"
import {
  type SystemPromptMode,
  takeSystemPromptAppend,
  toSystemPromptMode,
} from "../../../../src/server/system-prompt/core/system-prompt.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { inMemoryChatSummary, NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"

// `systemPrompt` に何が・どの順で載るかを、3通り（仕事・雑談・続きから始めるとき）で固定する
// （docs/architecture/character-pack.md「append に入る節の並び」）。本物の駆動を起こして確かめることはできない（`systemPrompt` は
// セッションを起こすときに固定され、あとから覗けない）ので、組み立ての側を見る。
//
// 文面そのものは写さない。 節の中身の正典は `REPORT_NOTATION_PROMPT` / `SPEECH_CADENCE_PROMPT` /
// `CHAT_MANNER_PROMPT` / `takeChatMemoryPromptParts` で、ここが見るのは並びとつなぎ方だけ。
// 期待値の見出しは定数から取り出す（文面を直してもここは二重にならない）。雑談の記憶の2節だけ
// 見出しを直に書く——前置きは `takeChatMemoryPromptParts` の外に出ておらず、ここで見たいのが
// 「どのモードで、どの順に載るか」の表そのものだから。

const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"
const SUMMARY = "架空の精霊と読んだ本の話をした。"
const RECENT: readonly ChatArchiveRecentEntry[] = [
  { speaker: "user", text: "ただいま", date: "2026-09-21" },
  { speaker: "character", text: "おかえりなのじゃ", date: "2026-09-21" },
]

/** 読み戻すと `RECENT` を返す `ChatArchive`。 */
const RECENT_CHAT_ARCHIVE = { ...NOOP_CHAT_ARCHIVE, readRecent: () => RECENT } satisfies ChatArchive

describe("takeSystemPromptAppend", () => {
  it("仕事のときは 人格 → セリフの間合い → レポートの記法 の順でつながる", () => {
    const append = takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })

    expect(append).toBe(`${PERSONA}\n\n${SPEECH_CADENCE_PROMPT}\n\n${REPORT_NOTATION_PROMPT}`)
  })

  it("雑談のときは 人格 → 雑談の作法 → 雑談の記憶 の順でつながる（仕事の2つは載らない）", () => {
    const summary = inMemoryChatSummary({ summary: SUMMARY, delivered: false })
    const archive = RECENT_CHAT_ARCHIVE
    const expectedMemory = takeChatMemoryPromptParts({
      start: { kind: "new" },
      chatSummary: inMemoryChatSummary({ summary: SUMMARY, delivered: false }),
      chatArchive: archive,
      packName: "架空",
      readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.recentBytes },
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
    const summary = inMemoryChatSummary({ summary: SUMMARY, delivered: true })

    const append = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode({ kind: "resume", sessionId: "fictional" }, summary, RECENT_CHAT_ARCHIVE),
    })

    expect(append).toBe(`${PERSONA}\n\n${CHAT_MANNER_PROMPT}`)
  })

  it("3通りの節の並びは、仕事・雑談・続きからで入れ替わる", () => {
    const work = takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })
    const chat = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode(
        { kind: "new" },
        inMemoryChatSummary({ summary: SUMMARY, delivered: false }),
        RECENT_CHAT_ARCHIVE,
      ),
    })
    const resumed = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode(
        { kind: "resume", sessionId: "fictional" },
        inMemoryChatSummary({ summary: SUMMARY, delivered: true }),
        RECENT_CHAT_ARCHIVE,
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
        inMemoryChatSummary({ summary: SUMMARY, delivered: false }),
        RECENT_CHAT_ARCHIVE,
      ),
    })

    expect(takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })).toContain(PERSONA)
    expect(chat).toContain(PERSONA)
  })

  it("雑談の記憶を載せたら写しの印は「渡し済み」に戻る（名前の `take` はこの副作用）", () => {
    const summary = inMemoryChatSummary({ summary: SUMMARY, delivered: false })

    takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode({ kind: "new" }, summary, RECENT_CHAT_ARCHIVE),
    })

    expect(summary.read()?.delivered).toBe(true)
  })

  it("雑談のときだけ載る条（覚える・忘れる・思い出す）は、仕事の append に入らない", () => {
    // 4つのツールは雑談のときだけ載るので、呼ぶ条件もこの文面だけが持つ
    // （docs/architecture/chat-mode.md「雑談モード」）。
    const work = takeSystemPromptAppend({ persona: PERSONA, mode: { kind: "work" } })

    expect(CHAT_MANNER_PROMPT).toContain("remember")
    expect(CHAT_MANNER_PROMPT).toContain("forget")
    expect(CHAT_MANNER_PROMPT).toContain("recall")
    expect(CHAT_MANNER_PROMPT).toContain("recall_episode")
    expect(work).not.toContain("forget")
    expect(work).not.toContain("recall")
  })

  it("雑談の作法に「完了」の1行の条は無い（催促は環境変数で塞ぐ。docs/architecture/chat-mode.md 4.9）", () => {
    expect(CHAT_MANNER_PROMPT).not.toContain("「完了」")
  })

  it("雑談の作法は口調を決めない（口調はキャラクターパックの persona.md の担当）", () => {
    // 正典を2つにしない（`REPORT_NOTATION_PROMPT` と同じ切り分け。docs/architecture/chat-mode.md「雑談モード」）。
    expect(CHAT_MANNER_PROMPT).toContain("speak")
    expect(CHAT_MANNER_PROMPT).not.toContain("一人称")
  })
})

describe("toSystemPromptMode", () => {
  it("読み戻す量は表（CHAT_MEMORY_BUDGET）から読む", () => {
    const chatSummary = inMemoryChatSummary({ summary: SUMMARY, delivered: false })
    const chatArchive = RECENT_CHAT_ARCHIVE
    const sessionMode: SessionMode = {
      kind: "chat",
      personaMemory: { remember: () => {}, forget: () => {}, finishTurn: () => {} },
      chatSummary,
      chatRecall: {
        recallList: () => ({ kind: "not-found" }),
        recallEpisode: () => ({ kind: "not-found" }),
        finishTurn: () => {},
      },
    }

    const mode = toSystemPromptMode(sessionMode, chatArchive, { kind: "new" }, "架空")

    expect(mode).toEqual({
      kind: "chat",
      memory: {
        start: { kind: "new" },
        chatSummary,
        chatArchive,
        packName: "架空",
        readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.recentBytes },
      },
    })
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
      readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.recentBytes },
    },
  }
}

/** 節の見出しの並び（`# ` と `## ` で始まる行）。逐語に挟まる日付は `### ` なので入らない。 */
function headings(text: string): readonly string[] {
  return text.split("\n").filter((line) => /^#{1,2} /.test(line))
}
