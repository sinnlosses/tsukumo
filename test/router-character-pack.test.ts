import { describe, expect, it } from "vitest"

import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import { createCommandClient } from "./fixture/command-client.ts"
import {
  CHARACTER_EVENT,
  CHAT_MODE_EVENT,
  createFakeSession,
  createRecordingPorts,
  GENERATED_CHARACTER,
  NO_DIARY_WRITER,
  REQUEST_EVENT,
  startRouter,
} from "./fixture/command-router.ts"

/** 生成に渡す立ち絵（中身は見ないので最小の png の data URL）。 */
const PORTRAIT_PNG_DATA_URL = "data:image/png;base64,AAAA"

describe("createSocketRouter（characterPack）", () => {
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
  it.each([
    {
      kind: "setAccent",
      send: (commands: ReturnType<typeof startRouter>["commands"]) =>
        commands.characterPack.setAccent({ pack: "fictional", target: "work", color: "#ffb3a7" }),
    },
    {
      kind: "setProfile",
      send: (commands: ReturnType<typeof startRouter>["commands"]) =>
        commands.characterPack.setProfile({
          pack: "fictional",
          name: "新しい表示名",
          tagline: "ひとこと",
        }),
    },
  ])("$kind も同じ経路を通る", async ({ kind, send }) => {
    const { commands, edits } = startRouter()

    expect(await send(commands)).toEqual({ ok: true })

    expect(edits.map((edit) => edit.kind)).toEqual([kind])
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
        persona: "",
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
        persona: "",
      }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterCreateFailed })
  })

  it("立ち絵からの生成は、口が返した欄の値をそのまま応答にし、駆動にも画面にも何も流さない", async () => {
    const { commands, stub, generations, emitted, restarts } = startRouter()

    expect(
      await commands.characterPack.generateFromPortrait({ portrait: PORTRAIT_PNG_DATA_URL }),
    ).toEqual({ ok: true, output: GENERATED_CHARACTER })

    expect(generations).toEqual([PORTRAIT_PNG_DATA_URL])
    expect(stub.calls).toEqual([])
    expect(restarts).toEqual([])
    expect(emitted).toEqual([])
  })

  it("立ち絵から生成できなかったら、生成の定型文の理由を返す", async () => {
    const { commands } = startRouter("rejected")

    expect(
      await commands.characterPack.generateFromPortrait({ portrait: PORTRAIT_PNG_DATA_URL }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.characterGenerationFailed })
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

describe("createSocketRouter（chat。画面の「編集」から覚えたことを1行消す）", () => {
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
