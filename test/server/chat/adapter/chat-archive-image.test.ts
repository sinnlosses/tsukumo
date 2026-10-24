import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createChatArchive,
  pruneChatImages,
} from "../../../../src/server/chat/adapter/chat-archive.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional-a")

const FICTIONAL_ID = "0b6f6a54-1c1e-4d7a-9c55-2f1f0a6b1e01"

/** 画像の中身の代わりの合成のバイト列。 */
const SYNTHETIC_BYTES = Buffer.from([0x01, 0x02, 0x03])

const dir = useTempDir("chat-archive-image")

function root(): string {
  return join(dir(), "chat-archive")
}

/** 2026-10 のその日のローカル正午（日をまたぐ心配をしない時刻）。 */
function noonOn(day: number): number {
  return Temporal.ZonedDateTime.from({
    year: 2026,
    month: 10,
    day,
    hour: 12,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

function imagesDir(packName: string): string {
  return join(root(), packName, "images")
}

/** 名前の先頭が `date` の画像ファイルを置き、その名前を返す。 */
function placeImage(packName: string, date: string): string {
  const name = `${date}-${FICTIONAL_ID}.png`
  mkdirSync(imagesDir(packName), { recursive: true })
  writeFileSync(join(imagesDir(packName), name), SYNTHETIC_BYTES)
  return name
}

describe("writeImage", () => {
  const SYNTHETIC_DATA_URL = `data:image/png;base64,${SYNTHETIC_BYTES.toString("base64")}`

  it("原寸のバイト列を images/<日付>-<id>.<拡張子> に書き、その名前を返す", async () => {
    const chatArchive = createChatArchive(root())

    const written = await chatArchive.writeImage(PACK, {
      id: FICTIONAL_ID,
      at: noonOn(20),
      dataUrl: SYNTHETIC_DATA_URL,
    })

    const fileName = `2026-10-20-${FICTIONAL_ID}.png`
    expect(written).toEqual({ kind: "written", fileName })
    expect(readFileSync(join(imagesDir(PACK), fileName))).toEqual(SYNTHETIC_BYTES)
  })

  it("同じ名前のファイルがあれば上書きせず失敗を返す", async () => {
    const chatArchive = createChatArchive(root())
    const image = { id: FICTIONAL_ID, at: noonOn(20), dataUrl: SYNTHETIC_DATA_URL }
    await chatArchive.writeImage(PACK, image)

    const again = await chatArchive.writeImage(PACK, {
      ...image,
      dataUrl: `data:image/png;base64,${Buffer.from([0x09]).toString("base64")}`,
    })

    expect(again.kind).toBe("failed")
    expect(readFileSync(join(imagesDir(PACK), `2026-10-20-${FICTIONAL_ID}.png`))).toEqual(
      SYNTHETIC_BYTES,
    )
  })

  it("id・data URL のどちらかが通らなければ、何も書かずに失敗を返す", async () => {
    const chatArchive = createChatArchive(root())
    const image = { id: FICTIONAL_ID, at: noonOn(20), dataUrl: SYNTHETIC_DATA_URL }

    expect((await chatArchive.writeImage(PACK, { ...image, id: "../escape" })).kind).toBe("failed")
    expect(
      (await chatArchive.writeImage(PACK, { ...image, dataUrl: "data:image/svg+xml;base64,AQID" }))
        .kind,
    ).toBe("failed")
    expect(existsSync(root())).toBe(false)
  })
})

describe("pruneChatImages", () => {
  it("今日から7日を過ぎた日付の画像を全パックぶん消し、7日目までは残す", () => {
    placeImage(PACK, "2026-10-12")
    const kept = placeImage(PACK, "2026-10-13")
    placeImage("fictional-b", "2026-10-01")
    const failures: unknown[] = []

    pruneChatImages("2026-10-20", (error) => failures.push(error), root())

    expect(readdirSync(imagesDir(PACK))).toEqual([kept])
    expect(readdirSync(imagesDir("fictional-b"))).toEqual([])
    expect(failures).toEqual([])
  })

  it("書く名前の形でないファイルには、日付が古くても触らない", () => {
    mkdirSync(imagesDir(PACK), { recursive: true })
    writeFileSync(join(imagesDir(PACK), "2026-01-01-note.txt"), SYNTHETIC_BYTES)

    pruneChatImages("2026-10-20", () => {}, root())

    expect(readdirSync(imagesDir(PACK))).toEqual(["2026-01-01-note.txt"])
  })

  it("置き場が無いのは失敗にしない", () => {
    const failures: unknown[] = []

    pruneChatImages("2026-10-20", (error) => failures.push(error), root())

    expect(failures).toEqual([])
  })
})

describe("消えた画像を指す行の読み戻し", () => {
  it("imageFiles の指す画像が無くても行は読め、読み戻しにファイル名も枚数も載らない", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: noonOn(20),
      text: "架空の依頼",
      images: 1,
      imageFiles: [`2026-10-01-${FICTIONAL_ID}.png`],
    })

    expect(chatArchive.readRecent(PACK, { recentBytes: 1_000 })).toEqual([
      { kind: "request", text: "架空の依頼", date: "2026-10-20", origin: { mode: "chat" } },
    ])
  })
})
