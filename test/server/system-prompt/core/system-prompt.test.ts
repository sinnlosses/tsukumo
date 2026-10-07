import { describe, expect, it } from "vitest"

import type { ChatArchive } from "../../../../src/server/chat/core/chat-archive-port.ts"
import { CHAT_MANNER_PROMPT } from "../../../../src/server/chat/core/chat-manner.ts"
import {
  takeChatMemoryPromptParts,
  workMemoryPromptParts,
} from "../../../../src/server/chat/core/chat-memory-prompt.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { QUESTION_NOTATION_PROMPT } from "../../../../src/server/session-driver/core/question-notation.ts"
import type {
  ChatArchiveRecentEntry,
  ChatSummary,
  SessionMode,
  SessionStart,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { WORK_PLAN_PROMPT } from "../../../../src/server/session-driver/core/work-plan-tool.ts"
import { SPEECH_CADENCE_PROMPT } from "../../../../src/server/system-prompt/core/speech-cadence.ts"
import {
  type SystemPromptMode,
  takeSystemPromptAppend,
  toSystemPromptMode,
} from "../../../../src/server/system-prompt/core/system-prompt.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { fixedChatSummary, inMemoryChatSummary, NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"

// `systemPrompt` に何が・どの順で載るかを、3通り（仕事・雑談・続きから始めるとき）で固定する
// （docs/architecture/character-pack.md「append に入る節の並び」）。本物の駆動を起こして確かめることはできない（`systemPrompt` は
// セッションを起こすときに固定され、あとから覗けない）ので、組み立ての側を見る。
//
// 文面そのものは写さない。 節の中身の正典は `REPORT_NOTATION_PROMPT` / `SPEECH_CADENCE_PROMPT` /
// `CHAT_MANNER_PROMPT` / `takeChatMemoryPromptParts` で、ここが見るのは並びとつなぎ方だけ。
// 期待値の見出しは定数から取り出す（文面を直してもここは二重にならない）。記憶の2節だけ
// 見出しを直に書く——前置きは `takeChatMemoryPromptParts` の外に出ておらず、ここで見たいのが
// 「どのモードで、どの順に載るか」の表そのものだから。

const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"
const SUMMARY = "架空の精霊と読んだ本の話をした。"
const RECENT: readonly ChatArchiveRecentEntry[] = [
  { kind: "request", origin: { mode: "chat" }, text: "ただいま", date: "2026-09-21" },
  { kind: "speech", origin: { mode: "chat" }, text: "おかえりなのじゃ", date: "2026-09-21" },
]

/** 読み戻すと `RECENT` を返す `ChatArchive`。 */
const RECENT_CHAT_ARCHIVE = { ...NOOP_CHAT_ARCHIVE, readRecent: () => RECENT } satisfies ChatArchive

describe("takeSystemPromptAppend", () => {
  it("仕事のときは 人格 → セリフの間合い → 段取り → レポートの記法 → 質問の書き方 の順でつながる", () => {
    const append = takeSystemPromptAppend({ persona: PERSONA, mode: workMode() })

    expect(append).toBe(
      `${PERSONA}\n\n${SPEECH_CADENCE_PROMPT}\n\n${WORK_PLAN_PROMPT}\n\n${REPORT_NOTATION_PROMPT}\n\n${QUESTION_NOTATION_PROMPT}`,
    )
  })

  it("仕事のときも記憶があれば、質問の書き方のあとに あらすじ → 直近の会話 が載る（雑談の作法は載らない）", () => {
    const summary = inMemoryChatSummary({ summary: SUMMARY, delivered: true })
    const expectedMemory = workMemoryPromptParts({
      chatSummary: summary,
      chatArchive: RECENT_CHAT_ARCHIVE,
      packName: "架空",
      readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes },
    })

    const append = takeSystemPromptAppend({
      persona: PERSONA,
      mode: workMode(summary, RECENT_CHAT_ARCHIVE),
    })

    expect(expectedMemory).toHaveLength(2)
    expect(append).toBe(
      [
        PERSONA,
        SPEECH_CADENCE_PROMPT,
        WORK_PLAN_PROMPT,
        REPORT_NOTATION_PROMPT,
        QUESTION_NOTATION_PROMPT,
        ...expectedMemory,
      ].join("\n\n"),
    )
    expect(append).not.toContain(CHAT_MANNER_PROMPT)
    expect(summary.read()?.delivered).toBe(true)
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
    expect(append).not.toContain(WORK_PLAN_PROMPT)
    expect(append).not.toContain(QUESTION_NOTATION_PROMPT)
  })

  it("続きから始めて写しが渡し済みなら、雑談の記憶は載らない（人格 → 雑談の作法 だけ）", () => {
    const summary = inMemoryChatSummary({ summary: SUMMARY, delivered: true })

    const append = takeSystemPromptAppend({
      persona: PERSONA,
      mode: chatMode({ kind: "resume", sessionId: "fictional" }, summary, RECENT_CHAT_ARCHIVE),
    })

    expect(append).toBe(`${PERSONA}\n\n${CHAT_MANNER_PROMPT}`)
  })

  it("人格が無いパック（空文字列）でも規約は載る（どのパックでも黙りっぱなしにしない）", () => {
    const append = takeSystemPromptAppend({ persona: "", mode: workMode() })

    expect(append).toBe(
      `${SPEECH_CADENCE_PROMPT}\n\n${WORK_PLAN_PROMPT}\n\n${REPORT_NOTATION_PROMPT}\n\n${QUESTION_NOTATION_PROMPT}`,
    )
  })

  it("雑談のときだけ載る条（覚える・忘れる・思い出す）は、仕事の append に入らない", () => {
    const work = takeSystemPromptAppend({
      persona: PERSONA,
      mode: workMode(
        inMemoryChatSummary({ summary: SUMMARY, delivered: true }),
        RECENT_CHAT_ARCHIVE,
      ),
    })

    expect(CHAT_MANNER_PROMPT).toContain("remember")
    expect(CHAT_MANNER_PROMPT).toContain("forget")
    expect(CHAT_MANNER_PROMPT).toContain("recall_episode")
    expect(work).not.toContain("remember")
    expect(work).not.toContain("forget")
    expect(work).not.toContain("recall_episode")
  })

  it("雑談の作法は口調を決めない（口調はキャラクターパックの persona.md の担当）", () => {
    // 口調は persona.md 側が決める（docs/architecture/chat-mode.md「雑談モード」）。
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

    const mode = toSystemPromptMode(
      sessionMode,
      chatArchive,
      () => undefined,
      { kind: "new" },
      "架空",
    )

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

  it("仕事のときはあらすじを読む口だけを渡し、読む量は workRecentBytes", () => {
    const readChatSummary = (): undefined => undefined
    const sessionMode: SessionMode = {
      kind: "work",
      chatRecall: {
        recallList: () => ({ kind: "not-found" }),
        recallEpisode: () => ({ kind: "not-found" }),
        finishTurn: () => {},
      },
    }

    const mode = toSystemPromptMode(
      sessionMode,
      RECENT_CHAT_ARCHIVE,
      readChatSummary,
      { kind: "resume", sessionId: "fictional" },
      "架空",
    )

    expect(mode).toEqual({
      kind: "work",
      memory: {
        chatSummary: { read: readChatSummary },
        chatArchive: RECENT_CHAT_ARCHIVE,
        packName: "架空",
        readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes },
      },
    })
  })
})

/** 仕事のモード（既定は記憶が空。読む量は本物の配線と同じ値）。 */
function workMode(
  chatSummary: Pick<ChatSummary, "read"> = fixedChatSummary(undefined),
  chatArchive: ChatArchive = NOOP_CHAT_ARCHIVE,
): SystemPromptMode {
  return {
    kind: "work",
    memory: {
      chatSummary,
      chatArchive,
      packName: "架空",
      readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes },
    },
  }
}

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
