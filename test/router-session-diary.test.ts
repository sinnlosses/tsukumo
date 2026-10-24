import { describe, expect, it } from "vitest"

import type { DiaryWriteRequest, DiaryWriterSource } from "../src/server/diary/core/diary-writer.ts"
import type { DailyAchievement } from "../src/shared/achievement/achievement.ts"
import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import type { SessionEvent } from "../src/shared/session/session-event.ts"
import { characterChangedEvent } from "./fixture/character.ts"
import { REQUEST_EVENT, startRouter } from "./fixture/command-router.ts"

describe("createSocketRouter（session）", () => {
  describe("成果の日記書き（session.reflectAchievement。`docs/requirements.md`「日記」）", () => {
    const KNOWN_DAY: DailyAchievement = {
      kind: "known",
      date: "2026-09-23",
      today: "2026-09-24",
      doneTasks: [{ id: "T-1", summary: "架空のタスク" }],
      graduations: [],
      milestones: [],
      diary: { kind: "none" },
    }

    const EMPTY_DAY: DailyAchievement = {
      ...KNOWN_DAY,
      doneTasks: [],
    }

    /**
     * 手で進める書き手のスタブ。待たない（`write` は呼ばれたことだけ記録し、解決しない
     * Promise を返す）——「書いている最中」を確かめるテストが、書き終わるのを待たずに
     * 状態を見られるようにする。
     */
    function createStubDiaryWriter() {
      const calls: DiaryWriteRequest[] = []
      const signals: AbortSignal[] = []
      const source: DiaryWriterSource = {
        kind: "write",
        write: (request, _onEvent, signal) => {
          calls.push(request)
          signals.push(signal)
          return new Promise(() => {})
        },
      }
      return { source, calls, signals }
    }

    it("その日の成果を数え直して diary-requested を流し、代の持ち物の書き手へ渡す", async () => {
      const seenDates: string[] = []
      const writer = createStubDiaryWriter()
      const { commands, emitted } = startRouter(
        "written",
        async (date) => {
          seenDates.push(date)
          return KNOWN_DAY
        },
        writer.source,
      )

      expect(await commands.session.reflectAchievement({ date: "2026-09-23" })).toEqual({
        ok: true,
      })

      expect(seenDates).toEqual(["2026-09-23"])
      expect(writer.calls).toHaveLength(1)
      expect(writer.calls[0]?.date).toBe("2026-09-23")
      expect(writer.calls[0]?.requestText).toContain("この日の日記を書いてほしい")
      expect(emitted.map((event) => event.kind)).toEqual(["diary-requested"])
    })

    it("振り返りの書き手には、いまの代の信号を渡す", async () => {
      const writer = createStubDiaryWriter()
      const { commands, diarySignal } = startRouter(
        "written",
        () => Promise.resolve(KNOWN_DAY),
        writer.source,
      )

      await commands.session.reflectAchievement({ date: "2026-09-23" })

      expect(writer.signals).toEqual([diarySignal])
    })

    it("会話のターン中・答え待ちでも受け付ける（会話とは別の使い捨ての問い合わせなので）", async () => {
      const writer = createStubDiaryWriter()
      const { commands, observe } = startRouter(
        "written",
        () => Promise.resolve(KNOWN_DAY),
        writer.source,
      )
      observe(REQUEST_EVENT)

      expect(await commands.session.reflectAchievement({ date: "2026-09-23" })).toEqual({
        ok: true,
      })
      expect(writer.calls).toHaveLength(1)
    })

    it("日記を書いている最中は断る（同じ日でもほかの日でも）", async () => {
      const writer = createStubDiaryWriter()
      const { commands } = startRouter("written", () => Promise.resolve(KNOWN_DAY), writer.source)

      expect(await commands.session.reflectAchievement({ date: "2026-09-23" })).toEqual({
        ok: true,
      })

      const second = await commands.session.reflectAchievement({ date: "2026-09-20" })
      expect(second).toEqual({ ok: false, reason: FRAME_ERROR_REASON.achievementReflectionWriting })
      expect(writer.calls).toHaveLength(1)
    })

    it("疑似セッション（dont-write）では diary-requested のすぐ後に diary-failed を流す", async () => {
      const { commands, emitted } = startRouter("written", () => Promise.resolve(KNOWN_DAY))

      expect(await commands.session.reflectAchievement({ date: "2026-09-23" })).toEqual({
        ok: true,
      })

      expect(emitted.map((event) => event.kind)).toEqual(["diary-requested", "diary-failed"])
    })

    it.each<[string, DailyAchievement | undefined]>([
      ["空の日", EMPTY_DAY],
      ["Beads が読めない日", { kind: "unknown" }],
      ["成果が読めなかった（undefined）", undefined],
    ])("%sは断る", async (_, day) => {
      const { commands } = startRouter("written", () => Promise.resolve(day))

      expect(await commands.session.reflectAchievement({ date: "2026-09-23" })).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.achievementReflectionUnavailable,
      })
    })
  })

  describe("表示した迎えの挨拶を記録に積ませる（session.recordWelcomeGreeting）", () => {
    const GREETED = {
      kind: "welcome-greeting-changed",
      state: {
        kind: "written",
        greeting: {
          withCard: "架空の挨拶、{札} からどう？",
          withoutCard: "架空の挨拶だけ",
          expression: "curious",
        },
      },
    } as const satisfies SessionEvent

    const WITH_CARD = { text: "架空の挨拶、T-1 からどう？", expression: "curious" } as const

    function startGreeting() {
      const router = startRouter()
      router.observe(characterChangedEvent())
      router.observe(GREETED)
      return router
    }

    it("いまの挨拶から組める文なら welcome-greeting-shown を流す", async () => {
      const { commands, emitted } = startGreeting()

      expect(await commands.session.recordWelcomeGreeting(WITH_CARD)).toEqual({ ok: true })

      expect(emitted).toEqual([{ kind: "welcome-greeting-shown", line: WITH_CARD }])
    })

    it("記録と同じ文なら、受け付けても流さない", async () => {
      const { commands, emitted } = startGreeting()

      await commands.session.recordWelcomeGreeting(WITH_CARD)
      expect(await commands.session.recordWelcomeGreeting(WITH_CARD)).toEqual({ ok: true })

      expect(emitted).toHaveLength(1)
    })

    it.each([
      ["組めない文", { text: "架空の別の文", expression: "curious" }, []],
      ["挨拶と違う表情", { text: "架空の挨拶だけ", expression: "sad" }, []],
      ["依頼のあと（迎えの挨拶を出していない）", WITH_CARD, [REQUEST_EVENT]],
    ] satisfies readonly (readonly [
      string,
      { readonly text: string; readonly expression: "curious" | "sad" },
      readonly SessionEvent[],
    ])[])("%sは断って流さない", async (_, line, before) => {
      const { commands, emitted, observe } = startGreeting()
      before.forEach(observe)

      expect(await commands.session.recordWelcomeGreeting(line)).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.welcomeGreetingNotShown,
      })
      expect(emitted).toEqual([])
    })
  })
})
