import { describe, expect, it } from "vitest"

import type { CommandRouterPorts } from "../src/router.ts"
import { CHAT_NUDGE_PROMPT } from "../src/server/chat/core/chat-nudge.ts"
import type { DiaryWriteRequest, DiaryWriterSource } from "../src/server/diary/core/diary-writer.ts"
import {
  createPromptImageShelf,
  type ShelvedPromptImage,
} from "../src/server/session-driver/core/prompt-image-shelf.ts"
import type { CommandSession } from "../src/server/session/core/command-session.ts"
import type { SessionLaunchRequest } from "../src/server/session/core/session-launch.ts"
import type { DailyAchievement } from "../src/shared/achievement/achievement.ts"
import type {
  CharacterCreate,
  CharacterDelete,
  CharacterEdit,
} from "../src/shared/contract/character-pack.ts"
import type { PromptRouting } from "../src/shared/contract/session.ts"
import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import type { PromptImage } from "../src/shared/session-driver/prompt-image.ts"
import type { SessionDefault } from "../src/shared/session/session-default.ts"
import type { SessionEvent } from "../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../src/shared/session/session-state.ts"
import { usageProposalKey } from "../src/shared/usage-review/usage-review.ts"
import { characterChangedEvent, shownPortraits } from "./fixture/character.ts"
import { createCommandClient } from "./fixture/command-client.ts"
import { createStubDriver, type StubDriver } from "./fixture/session-driver.ts"

/** 偽のセッションがイベントを畳むときの時刻。 */
const NOW = 1_000

/** 見た目の編集・作る・消すが書けたときに流し直す `character-changed`（手で書いた架空のパック）。 */
const CHARACTER_EVENT: SessionEvent = characterChangedEvent({
  ...shownPortraits({ default: "/character/default.png?v=fictional@2" }),
})

/** 覚えたことを1行消したあとに流し直す `remembered-lines-changed`（作り物の1行）。 */
const REMEMBERED_LINES_EVENT: SessionEvent = {
  kind: "remembered-lines-changed",
  lines: ["架空の残った1行"],
}

/** 振り返りの書き手を気にしないテストに渡す出どころ（起こさない）。 */
const NO_DIARY_WRITER: DiaryWriterSource = { kind: "dont-write" }

const REQUEST_EVENT = { kind: "request", text: "架空の依頼", images: [] } satisfies SessionEvent
const TURN_FINISHED_EVENT = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} satisfies SessionEvent
const CHAT_MODE_EVENT = { kind: "chat-mode-changed", chat: true } satisfies SessionEvent

/**
 * 受け手に見せるセッションの口の代役。
 * 姿は本物の reducer で畳むので、受け手が流したイベントも `observe` で届けたイベントも、断る条件の判定に効く。
 * 起こし直しは頼まれた要求を覚えるだけで、代は変えない。
 */
type FakeSession = {
  readonly session: CommandSession
  readonly stub: StubDriver
  /** 受け手が流したイベント（流した順）。 */
  readonly emitted: readonly SessionEvent[]
  /** 頼まれた起こし直しの要求（頼まれた順）。 */
  readonly restarts: readonly SessionLaunchRequest[]
  readonly diarySignal: AbortSignal
  /** 駆動から届いたことにして、イベントを姿に畳む。 */
  readonly observe: (event: SessionEvent) => void
}

function createFakeSession(stub: StubDriver = createStubDriver()): FakeSession {
  const emitted: SessionEvent[] = []
  const restarts: SessionLaunchRequest[] = []
  const diaryAbort = new AbortController()
  let state: SessionState = INITIAL_SESSION_STATE
  const observe = (event: SessionEvent): void => {
    state = applySessionEvent(state, event, NOW)
  }
  return {
    session: {
      state: () => state,
      driver: () => Promise.resolve(stub.driver),
      restart: (request) => {
        restarts.push(request)
        return Promise.resolve({ ok: true })
      },
      generation: () => ({
        emit: (event) => {
          emitted.push(event)
          observe(event)
        },
        diarySignal: diaryAbort.signal,
      }),
    },
    stub,
    emitted,
    restarts,
    diarySignal: diaryAbort.signal,
    observe,
  }
}

/** 呼ばれた口と引数を積む受け手の口。書き込みの結果は `writeResult` で決める。 */
function createRecordingPorts(
  writeResult: "written" | "rejected",
  readAchievementDay: (date: string) => Promise<DailyAchievement | undefined>,
  diary: DiaryWriterSource,
) {
  const edits: CharacterEdit[] = []
  const creates: CharacterCreate[] = []
  const deletes: CharacterDelete[] = []
  const remembered: SessionDefault[] = []
  const forgottenLines: string[] = []
  const openedFiles: string[] = []
  const written = (): SessionEvent | undefined =>
    writeResult === "written" ? CHARACTER_EVENT : undefined
  const ports: CommandRouterPorts = {
    session: {
      promptImageShelf: createPromptImageShelf(),
      rememberSessionDefault: (sessionDefault) => {
        remembered.push(sessionDefault)
        return { kind: "session-default-changed", sessionDefault }
      },
      readAchievementDay,
      diary,
    },
    characterPack: {
      editCharacter: (edit) => {
        edits.push(edit)
        return Promise.resolve(written())
      },
      createCharacter: (create) => {
        creates.push(create)
        return Promise.resolve(written())
      },
      deleteCharacter: (remove) => {
        deletes.push(remove)
        return Promise.resolve(written())
      },
    },
    chat: {
      forgetRememberedLine: (line) => {
        forgottenLines.push(line)
        return Promise.resolve(writeResult === "written" ? REMEMBERED_LINES_EVENT : undefined)
      },
    },
    usageReview: {
      dismissUsageProposal: (dismiss) => ({
        kind: "usage-proposal-dismissed",
        key: usageProposalKey(dismiss),
      }),
    },
    host: {
      openFile: (path) => {
        openedFiles.push(path)
        return Promise.resolve(writeResult === "written")
      },
    },
  }
  return {
    ports,
    edits,
    creates,
    deletes,
    remembered,
    forgottenLines,
    openedFiles,
  }
}

function startRouter(
  writeResult: "written" | "rejected" = "written",
  readAchievementDay: (date: string) => Promise<DailyAchievement | undefined> = () =>
    Promise.resolve(undefined),
  diary: DiaryWriterSource = NO_DIARY_WRITER,
) {
  const fake = createFakeSession()
  const recorded = createRecordingPorts(writeResult, readAchievementDay, diary)
  return { ...fake, ...recorded, commands: createCommandClient(recorded.ports, fake.session) }
}

describe("createCommandRouter（session）", () => {
  // 帯のドロップダウンはセッション限り（`docs/architecture/screen-design.md`「設定の置き場所」）。既定は書き換わらない。
  it("駆動へそのまま渡す5種は、駆動の口を順に1つずつ呼ぶ", async () => {
    const { commands, stub, remembered } = startRouter()

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    expect(await commands.session.interrupt()).toEqual({ ok: true })
    expect(await commands.session.setModel({ model: "sonnet" })).toEqual({ ok: true })
    expect(await commands.session.setEffort({ effort: "high" })).toEqual({ ok: true })
    expect(await commands.session.setPermissionMode({ mode: "plan" })).toEqual({ ok: true })

    expect(stub.calls).toEqual([
      "prompt:request:架空の依頼",
      "interrupt",
      "setModel:sonnet",
      "setEffort:high",
      "setPermissionMode:plan",
    ])
    expect(remembered).toEqual([])
  })

  it("背景のタスクが残っていて送り方が許すときだけ、仕事の言葉を脇の話として駆動へ渡す", async () => {
    const { commands, stub, observe } = startRouter()
    const prompt = (text: string, routing: PromptRouting) =>
      commands.session.prompt({ text, images: [], routing })

    await prompt("架空の背景の無い問い", "aside-when-background")
    observe({
      kind: "background-tasks-changed",
      tasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
    })
    await prompt("架空の委譲中の問い", "aside-when-background")
    await prompt("架空の新しい依頼", "new-request")
    observe({ kind: "chat-mode-changed", chat: true })
    await prompt("架空の雑談の一言", "aside-when-background")

    expect(stub.calls).toEqual([
      "prompt:request:架空の背景の無い問い",
      "prompt:aside:架空の委譲中の問い",
      "prompt:request:架空の新しい依頼",
      "prompt:request:架空の雑談の一言",
    ])
  })

  it("終わった会話への依頼は、定型文の理由で受け付けず駆動へ積まない", async () => {
    const { commands, stub } = startRouter()
    stub.ended = true

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.sessionEnded,
    })
    expect(stub.calls).toEqual([])
  })

  it("解決済みの答え待ちは、定型文の理由で受け付けない", async () => {
    const { commands, stub } = startRouter()
    stub.answerable = false

    expect(await commands.session.answer({ id: "toolu_gone", answer: { kind: "allow" } })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.unresolvedAnswer,
    })
  })

  it("駆動が例外を投げても定型文の理由を返し、常駐プロセスは落ちない", async () => {
    const stub = createStubDriver()
    const fake = createFakeSession({
      ...stub,
      driver: { ...stub.driver, interrupt: () => Promise.reject(new Error("架空の駆動エラー")) },
    })
    const { ports } = createRecordingPorts(
      "written",
      () => Promise.resolve(undefined),
      NO_DIARY_WRITER,
    )
    const commands = createCommandClient(ports, fake.session)

    expect(await commands.session.interrupt()).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.driverFailed,
    })

    // 落ちていないので、次のコマンドも受け付ける。
    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({ ok: true })
  })

  it("prompt の原寸を棚に置き、振った id を駆動へ渡す（棚から同じ原寸が引ける）", async () => {
    const prompted: ShelvedPromptImage[][] = []
    const stub = createStubDriver()
    const fake = createFakeSession({
      ...stub,
      driver: {
        ...stub.driver,
        prompt: (_text: string, images: readonly ShelvedPromptImage[]) => {
          prompted.push([...images])
        },
      },
    })
    const { ports } = createRecordingPorts(
      "written",
      () => Promise.resolve(undefined),
      NO_DIARY_WRITER,
    )
    const commands = createCommandClient(ports, fake.session)
    // 原寸は手で組んだ架空の data URL（実物の画像は使わない）。
    const image: PromptImage = {
      full: `data:image/png;base64,${"A".repeat(4096)}`,
      thumbnail: "data:image/png;base64,A",
    }

    await commands.session.prompt({ text: "架空の依頼", images: [image] })

    const [shelved] = prompted[0] ?? []
    expect(shelved?.full).toBe(image.full)
    expect(ports.session.promptImageShelf.find(shelved?.id ?? "")).toBe(image.full)
  })

  it("ターン進行中の session.setEffort は session.setModel と同じく起こし直さず、駆動へそのまま渡す", async () => {
    const { commands, stub, restarts, observe } = startRouter()

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    observe(REQUEST_EVENT)

    expect(await commands.session.setEffort({ effort: "xhigh" })).toEqual({ ok: true })
    expect(restarts).toEqual([])
    expect(stub.calls).toContain("setEffort:xhigh")
  })

  it("switchCharacter は画面から選ばれた名前で、いまのモードのまま、最新の続きから起こし直す", async () => {
    const { commands, restarts, observe } = startRouter()
    observe(CHAT_MODE_EVENT)

    expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({ ok: true })

    // 名前で渡すのは画面から選ばれたときだけ（＝覚える側。docs/architecture/screen-design.md「設定の置き場所」）。
    expect(restarts).toEqual([
      { selection: { by: "name", name: "fictional" }, chat: true, resume: { by: "latest" } },
    ])
  })

  it("ターン進行中の session.switchCharacter は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { commands, restarts, observe } = startRouter()

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    observe(REQUEST_EVENT)

    expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.switchDuringTurn,
    })
    expect(restarts).toEqual([])

    observe(TURN_FINISHED_EVENT)

    expect(await commands.session.switchCharacter({ name: "fictional" })).toEqual({ ok: true })
    expect(restarts).toHaveLength(1)
  })

  it("session.switchSession で、選ばれたIDの続きから起こし直す（パックもモードも変えない）", async () => {
    const { commands, restarts } = startRouter()

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: true,
    })

    // 変わるのは「どの transcript の続きから始めるか」だけ。
    // パックは「いま出しているまま」（名前で渡すと覚えた値が書き換わる。docs/architecture/screen-design.md「設定の置き場所」）。
    expect(restarts).toEqual([
      {
        selection: { by: "current" },
        chat: false,
        resume: { by: "id", sessionId: "架空の別セッション" },
      },
    ])
  })

  it("ターン進行中の session.switchSession は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { commands, restarts, observe } = startRouter()
    observe(REQUEST_EVENT)

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.sessionSwitchDuringTurn,
    })
    expect(restarts).toEqual([])

    observe(TURN_FINISHED_EVENT)

    expect(await commands.session.switchSession({ sessionId: "架空の別セッション" })).toEqual({
      ok: true,
    })
    expect(restarts).toHaveLength(1)
  })

  it("session.setChatMode で雑談を指定して起こし直し、いま出しているパックは保つ", async () => {
    // 雑談の切り替えは `systemPrompt` の差し替えなので、`session.switchCharacter` と同じ起こし直しに
    // なる（docs/architecture/chat-mode.md「雑談モード」）。パックは変えないことをここで見る。
    const { commands, restarts } = startRouter()

    expect(await commands.session.setChatMode({ chat: true })).toEqual({ ok: true })

    // パックは「いま出しているまま」として渡す（名前では渡さない）。名前で渡すと画面から
    // 選ばれたのと区別がつかず、モードを切り替えただけで覚えた値が書き換わる
    // （docs/architecture/screen-design.md「設定の置き場所」）。
    expect(restarts).toEqual([
      { selection: { by: "current" }, chat: true, resume: { by: "latest" } },
    ])
  })

  it("雑談から仕事へ戻すときも起こし直す", async () => {
    const { commands, restarts } = startRouter()

    await commands.session.setChatMode({ chat: true })
    await commands.session.setChatMode({ chat: false })

    expect(restarts.map((request) => request.chat)).toEqual([true, false])
  })

  it("ターン進行中の session.setChatMode は定型文の理由で受け付けず、駆動を閉じない", async () => {
    const { commands, restarts, observe } = startRouter()

    expect(await commands.session.prompt({ text: "架空の依頼", images: [] })).toEqual({
      ok: true,
    })
    observe(REQUEST_EVENT)

    expect(await commands.session.setChatMode({ chat: true })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.chatModeSwitchDuringTurn,
    })
    expect(restarts).toEqual([])
  })

  it("session.setSessionDefault を覚えさせ、姿に載せて配る", async () => {
    const { commands, remembered, emitted } = startRouter()

    const result = await commands.session.setSessionDefault({
      model: "sonnet",
      effort: "high",
      permissionMode: "plan",
    })

    expect(result).toEqual({ ok: true })
    expect(remembered).toEqual([{ model: "sonnet", effort: "high", permissionMode: "plan" }])
    expect(emitted).toEqual([
      {
        kind: "session-default-changed",
        sessionDefault: { model: "sonnet", effort: "high", permissionMode: "plan" },
      },
    ])
  })

  describe("キャラクターから話しかけてもらう（nudge）", () => {
    it("雑談モードなら、記録に残さない口へ core が持つ文面を渡す（依頼としては送らない）", async () => {
      const { commands, stub, observe } = startRouter()
      observe(CHAT_MODE_EVENT)

      expect(await commands.session.nudge()).toEqual({ ok: true })

      // 渡るのは `promptWithoutRecord`（記録に残さない口）だけで、`prompt` は呼ばれない
      // ——ログにも記録にも雑談の会話のアーカイブにも残らない（docs/architecture/screen-design.md「雑談モードの画面」）。
      expect(stub.calls).toEqual([`promptWithoutRecord:${CHAT_NUDGE_PROMPT}`])
    })

    it("終わった会話には送らない", async () => {
      const { commands, stub, observe } = startRouter()
      observe(CHAT_MODE_EVENT)
      stub.ended = true

      expect(await commands.session.nudge()).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.sessionEnded,
      })
      expect(stub.calls).toEqual([])
    })

    it("仕事のモードでは受け付けない（メインビューにキャラクター発のターンを混ぜない）", async () => {
      const { commands, stub } = startRouter()

      expect(await commands.session.nudge()).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.nudgeOutsideChat,
      })
      expect(stub.calls).toEqual([])
    })

    it("ターン進行中は受け付けない（画面のボタンと同じ条件をサーバでも見る）", async () => {
      const { commands, stub, observe } = startRouter()
      observe(CHAT_MODE_EVENT)
      observe(REQUEST_EVENT)

      expect(await commands.session.nudge()).toEqual({
        ok: false,
        reason: FRAME_ERROR_REASON.nudgeDuringTurn,
      })
      expect(stub.calls).toEqual([])
    })
  })

  describe("成果の振り返り（session.reflectAchievement。`docs/requirements.md`「日記」）", () => {
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
})

describe("createCommandRouter（characterPack）", () => {
  it("使用中でないパックを変えるコマンドも起こし直さず、書き込み先へ pack をそのまま渡す", async () => {
    const { commands, stub, edits, restarts } = startRouter()

    expect(
      await commands.characterPack.setBackground({
        pack: "fictional-other",
        image: "data:image/png;base64,AAAA",
      }),
    ).toEqual({ ok: true })

    expect(stub.calls).toEqual([])
    expect(edits.map((edit) => edit.pack)).toEqual(["fictional-other"])
    expect(restarts).toEqual([])
  })

  // どの種類が見た目の編集の行に当たるかは `CharacterEdit` の表と型が持ち主。
  // ここで見るのは、その手続きが editCharacter 経由の書き込みへ実際に届くこと。
  it("setOutfitAccent も同じ経路を通る", async () => {
    const { commands, edits } = startRouter()

    expect(
      await commands.characterPack.setOutfitAccent({
        pack: "fictional",
        outfit: "heavy",
        color: "#ffb3a7",
      }),
    ).toEqual({ ok: true })

    expect(edits.map((edit) => edit.kind)).toEqual(["setOutfitAccent"])
  })

  it("setProfile も同じ経路を通る", async () => {
    const { commands, edits } = startRouter()

    expect(
      await commands.characterPack.setProfile({
        pack: "fictional",
        name: "新しい表示名",
        tagline: "ひとこと",
      }),
    ).toEqual({ ok: true })

    expect(edits.map((edit) => edit.kind)).toEqual(["setProfile"])
  })

  it("新しいパックを作るコマンドも駆動へ渡さず、選択肢の増えた character-changed を配る", async () => {
    const { commands, stub, edits, creates, emitted, restarts } = startRouter()

    expect(
      await commands.characterPack.create({
        id: "fictional-2",
        name: "",
        portraits: {
          default: "data:image/png;base64,AAAA",
        },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toEqual({ ok: true })

    // 駆動には何も渡らない（作っただけでは切り替えないので、起こし直しも起きない）。
    expect(stub.calls).toEqual([])
    expect(restarts).toEqual([])
    expect(edits).toEqual([])
    expect(creates.map((create) => create.id)).toEqual(["fictional-2"])
    expect(emitted).toEqual([CHARACTER_EVENT])
  })

  it("パックを作れなかったら、作る側の定型文の理由を返す", async () => {
    const { commands } = startRouter("rejected")

    expect(
      await commands.characterPack.create({
        id: "fictional",
        name: "",
        portraits: {
          default: "data:image/png;base64,AAAA",
        },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterCreateFailed })
  })

  it("パックを消すコマンドも駆動へ渡さず、ターン中でも選択肢の減った character-changed を配る", async () => {
    const { commands, stub, deletes, emitted, restarts, observe } = startRouter()
    observe(REQUEST_EVENT)

    expect(await commands.characterPack.delete({ pack: "fictional-2" })).toEqual({ ok: true })

    // 使用中のパックは消せないので、起こし直しも駆動への受け渡しも起きない。
    expect(stub.calls).toEqual([])
    expect(restarts).toEqual([])
    expect(deletes.map((remove) => remove.pack)).toEqual(["fictional-2"])
    expect(emitted).toEqual([CHARACTER_EVENT])
  })

  it("パックを消せなかったら、消す側の定型文の理由を返す", async () => {
    const { commands } = startRouter("rejected")

    expect(await commands.characterPack.delete({ pack: "fictional" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.characterDeleteFailed,
    })
  })

  it("書き込みが受け付けられなかったら定型文の理由を返し、状態は動かさない", async () => {
    const { commands, emitted } = startRouter("rejected")

    expect(
      await commands.characterPack.clearPortrait({
        pack: "fictional",
        expression: "proud",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterEditFailed })

    expect(emitted).toEqual([])
  })

  it("キャラクターへの書き込みが例外を投げても定型文の理由を返す", async () => {
    const fake = createFakeSession()
    const { ports } = createRecordingPorts(
      "written",
      () => Promise.resolve(undefined),
      NO_DIARY_WRITER,
    )
    const commands = createCommandClient(
      {
        ...ports,
        characterPack: {
          ...ports.characterPack,
          editCharacter: () => Promise.reject(new Error("架空の書き込み失敗")),
        },
      },
      fake.session,
    )

    expect(
      await commands.characterPack.clearPortrait({
        pack: "fictional",
        expression: "proud",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterEditFailed })
  })
})

describe("createCommandRouter（chat。画面の「編集」から覚えたことを1行消す）", () => {
  it("雑談モードなら、消したい行を渡して流し直しを配る（駆動には渡らない）", async () => {
    const { commands, stub, forgottenLines, emitted, observe } = startRouter()
    observe(CHAT_MODE_EVENT)

    expect(await commands.chat.forgetRememberedLine({ line: "架空の消したい1行" })).toEqual({
      ok: true,
    })

    expect(forgottenLines).toEqual(["架空の消したい1行"])
    expect(stub.calls).toEqual([])
    expect(emitted).toEqual([{ kind: "remembered-lines-changed", lines: ["架空の残った1行"] }])
  })

  it("仕事のモードでは受け付けない（サイドバーの「覚えていること」自体が雑談中にしか出ない）", async () => {
    const { commands, forgottenLines } = startRouter()

    expect(await commands.chat.forgetRememberedLine({ line: "架空の消したい1行" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.forgetRememberedLineOutsideChat,
    })
    expect(forgottenLines).toEqual([])
  })

  it("消せなかったら、消す側の定型文の理由を返す", async () => {
    const { commands, observe } = startRouter("rejected")
    observe(CHAT_MODE_EVENT)

    expect(await commands.chat.forgetRememberedLine({ line: "架空の消したい1行" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.forgetRememberedLineFailed,
    })
  })
})

describe("createCommandRouter（host。レポートに書かれたパスを開く）", () => {
  it("開けたら ok を返し、渡したパスが options.openFile に届く", async () => {
    const { commands, stub, openedFiles, restarts } = startRouter()

    expect(await commands.host.openFile({ path: "src/foo.ts" })).toEqual({ ok: true })
    // 駆動へは渡らない・起こし直しも起きない。
    expect(stub.calls).toEqual([])
    expect(restarts).toEqual([])
    expect(openedFiles).toEqual(["src/foo.ts"])
  })

  it("開けなかったら（一覧に無い・orca が無い・失敗）定型文の理由を返す", async () => {
    const { commands, openedFiles } = startRouter("rejected")

    expect(await commands.host.openFile({ path: "src/nope.ts" })).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.openFileFailed,
    })
    expect(openedFiles).toEqual(["src/nope.ts"])
  })

  it("ターン進行中でも受け付ける（読むだけの操作なので断らない）", async () => {
    const { commands, openedFiles, observe } = startRouter()
    observe(REQUEST_EVENT)

    expect(await commands.host.openFile({ path: "src/foo.ts" })).toEqual({ ok: true })
    expect(openedFiles).toEqual(["src/foo.ts"])
  })
})
