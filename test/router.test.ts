import { describe, expect, it } from "vitest"

import { CHAT_NUDGE_PROMPT } from "../src/server/chat/core/chat-nudge.ts"
import type { ShelvedPromptImage } from "../src/server/session-driver/core/prompt-image-shelf.ts"
import type { PromptRouting } from "../src/shared/contract/session.ts"
import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import type { PromptImage } from "../src/shared/session-driver/prompt-image.ts"
import { createCommandClient } from "./fixture/command-client.ts"
import {
  CHAT_MODE_EVENT,
  createFakeSession,
  createRecordingPorts,
  NO_DIARY_WRITER,
  REQUEST_EVENT,
  startRouter,
} from "./fixture/command-router.ts"
import { createStubDriver } from "./fixture/session-driver.ts"

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

  it("バックグラウンドタスクが残っていて送り方が許すときだけ、仕事の言葉を脇の話として駆動へ渡す", async () => {
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
      // ——ログにも記録にも会話のアーカイブにも残らない（docs/architecture/screen-design.md「雑談モードの画面」）。
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
})
