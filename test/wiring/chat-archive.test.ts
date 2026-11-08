import { existsSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { switchedChatArchive } from "../../src/wiring/chat-archive.ts"
import type { WiringDriver } from "../../src/wiring/wiring-context.ts"
import { bundledFakeSession } from "../fixture/bundled-fake-session.ts"
import { characterPackName } from "../fixture/character.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const home = useTempDir("chat-archive-wiring")

const PACK = characterPackName("fictional-pack")

const FAKE_DRIVER = {
  kind: "fake",
  session: bundledFakeSession(),
  scene: undefined,
  sceneUntil: undefined,
} satisfies WiringDriver

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("switchedChatArchive", () => {
  it("疑似セッションの駆動では、ホームに何も書かず読み戻しも空", () => {
    vi.stubEnv("TSUKUMO_HOME", home())
    const archive = switchedChatArchive(FAKE_DRIVER)

    archive.append(PACK, {
      mode: "work",
      kind: "request",
      at: 1,
      text: "架空の依頼",
      project: "fictional",
      images: 0,
    })

    expect(existsSync(join(home(), "chat-archive"))).toBe(false)
    expect(archive.readRecent(PACK, { recentBytes: 1000 })).toEqual([])
    expect(archive.appendedBytes(PACK)).toBe(0)
  })

  it("疑似セッションの駆動では、画像の書きを失敗として知らせず、ホームにも書かない", async () => {
    vi.stubEnv("TSUKUMO_HOME", home())
    const archive = switchedChatArchive(FAKE_DRIVER)

    const result = await archive.writeImage(PACK, {
      id: "img-1",
      at: 1,
      dataUrl: "data:image/png;base64,AAAA",
    })

    expect(result.kind).toBe("written")
    expect(existsSync(join(home(), "chat-archive"))).toBe(false)
  })
})
