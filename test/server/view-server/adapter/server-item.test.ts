import { afterEach, describe, expect, it } from "vitest"

import {
  closeRunningView,
  noCharacterAsset,
  startView,
  viewOrigin,
} from "../../../fixture/view-server.ts"

afterEach(closeRunningView)

const asked: { fileName: string; version: string | undefined }[] = []

function serve(fileName: string, version: string | undefined) {
  asked.push({ fileName, version })
  return fileName === "1.svg"
    ? {
        contentType: "image/svg+xml; charset=utf-8",
        content: Buffer.from("<svg></svg>"),
        versioned: version === "5",
      }
    : undefined
}

describe("startViewServer（/item/）", () => {
  it("載っている名は、デコードした名前と ?v= で引いた中身を型つきで配る", async () => {
    asked.length = 0
    const server = await startView(noCharacterAsset, undefined, {}, undefined, undefined, serve)

    const response = await fetch(`${viewOrigin(server)}/item/1.svg?v=5`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe("<svg></svg>")
    expect(asked).toEqual([{ fileName: "1.svg", version: "5" }])
  })

  it("版が合ったときだけ長期のキャッシュ、そうでなければ no-store", async () => {
    const server = await startView(noCharacterAsset, undefined, {}, undefined, undefined, serve)
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/item/1.svg?v=5`)).headers.get("cache-control")).toBe(
      "max-age=31536000, immutable",
    )
    expect((await fetch(`${origin}/item/1.svg?v=6`)).headers.get("cache-control")).toBe("no-store")
  })

  it("直接開かれても動かない CSP（sandbox）を付ける", async () => {
    const server = await startView(noCharacterAsset, undefined, {}, undefined, undefined, serve)

    const response = await fetch(`${viewOrigin(server)}/item/1.svg`)

    expect(response.headers.get("content-security-policy")?.split("; ")).toEqual(
      expect.arrayContaining(["default-src 'none'", "sandbox"]),
    )
  })

  it("載っていない名・区切りを含む経路・壊れた % は404", async () => {
    asked.length = 0
    const server = await startView(noCharacterAsset, undefined, {}, undefined, undefined, serve)
    const origin = viewOrigin(server)

    expect((await fetch(`${origin}/item/2.svg`)).status).toBe(404)
    expect((await fetch(`${origin}/item/a/1.svg`)).status).toBe(404)
    expect((await fetch(`${origin}/item/%E0%A4%A`)).status).toBe(404)
    expect(asked).toEqual([{ fileName: "2.svg", version: undefined }])
  })
})
