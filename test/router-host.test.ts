import { describe, expect, it } from "vitest"

import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import { REQUEST_EVENT, startRouter } from "./fixture/command-router.ts"

describe("createSocketRouter（host。レポートに書かれたパスを開く）", () => {
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
