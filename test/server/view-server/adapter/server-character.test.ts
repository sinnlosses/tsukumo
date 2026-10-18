import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { get } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  characterChangedEvent,
  listCharacterPacks,
  readCharacterAsset,
} from "../../../../src/server/character-pack/adapter/character-pack.ts"
import type { ViewServer } from "../../../../src/server/view-server/adapter/server.ts"
import type { CharacterAssetLocation } from "../../../../src/shared/character-pack/character-asset.ts"
import { closeRunningView, startView, viewOrigin } from "../../../fixture/view-server.ts"

afterEach(closeRunningView)

describe("startViewServer", () => {
  it("/character/<pack>/<file> は、デコードしたパック名とファイル名と `?v=`（無ければ undefined）で引いた中身をそのまま配る", async () => {
    const asked: CharacterAssetLocation[] = []
    const versions: (string | undefined)[] = []
    const server = await startView((location, version) => {
      asked.push(location)
      versions.push(version)
      return location.fileName === "default.svg"
        ? {
            contentType: "image/svg+xml; charset=utf-8",
            content: Buffer.from("<svg></svg>"),
            versioned: false,
          }
        : undefined
    })
    const origin = viewOrigin(server)

    const response = await fetch(`${origin}/character/my%20pack/default.svg?v=1700000000000`)
    await fetch(`${origin}/character/my%20pack/default.svg`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe("<svg></svg>")
    expect(asked).toEqual([
      { pack: "my pack", fileName: "default.svg" },
      { pack: "my pack", fileName: "default.svg" },
    ])
    expect(versions).toEqual(["1700000000000", undefined])
  })

  it("/character/<pack>/<file> は、版が合った（versioned）ときだけ長期のキャッシュを指定し、そうでなければ no-store", async () => {
    const server = await startView((location) => ({
      contentType: "image/png",
      content: Buffer.from("x"),
      versioned: location.pack === "versioned",
    }))
    const origin = viewOrigin(server)

    const cached = await fetch(`${origin}/character/versioned/a.png?v=1`)
    const uncached = await fetch(`${origin}/character/other/a.png?v=1`)

    expect(cached.headers.get("cache-control")).toBe("max-age=31536000, immutable")
    expect(uncached.headers.get("cache-control")).toBe("no-store")
  })

  it("/character/<pack>/<file> は、直接開かれてもスクリプトが動かない CSP（sandbox）を付ける", async () => {
    const server = await startView(() => ({
      contentType: "image/svg+xml",
      content: Buffer.from("<svg/>"),
      versioned: false,
    }))

    const response = await fetch(`${viewOrigin(server)}/character/a/default.svg`)

    expect(response.headers.get("content-security-policy")?.split("; ")).toEqual(
      expect.arrayContaining(["default-src 'none'", "sandbox"]),
    )
  })

  it("/character/<file>（パック名の無い形）は引きに行かずに404", async () => {
    const asked: CharacterAssetLocation[] = []
    const server = await startView((location) => {
      asked.push(location)
      return undefined
    })

    const response = await fetch(`${viewOrigin(server)}/character/default.svg`)

    expect(response.status).toBe(404)
    expect(asked).toEqual([])
  })
})

// 一覧に載せた URL をそのまま引いて、配信の全体（経路の読み分け → 一覧との突き合わせ →
// パックごとの allowlist）を確かめる（docs/architecture/character-pack.md「パックの一覧と素材の URL」）。素材は手で書いた
// 架空の SVG / PNG の中身で、置き場は一時ディレクトリ（本物の `~/.tsukumo` を読まない）。
describe("キャラクターの素材（使用中以外のパックも配る）", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47])

  let root: string | undefined

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true })
      root = undefined
    }
  })

  /**
   * 同梱に使用中の `spirit`、ホームに使用中以外の `other`（立ち絵・背景つき）を置き、
   * `createCurrentCharacter` と同じ組み方でサーバを起こす。一覧（`packs`）も返す。
   */
  async function startWithPacks(): Promise<{
    readonly server: ViewServer
    readonly other: { readonly portrait: string; readonly background: string }
  }> {
    const base = mkdtempSync(join(tmpdir(), "tsukumo-server-character-"))
    root = base
    const bundled = join(base, "bundled")
    const home = join(base, "home")
    const cwd = join(base, "cwd")
    mkdirSync(join(bundled, "spirit"), { recursive: true })
    writeFileSync(
      join(bundled, "spirit", "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" } }),
    )
    writeFileSync(join(bundled, "spirit", "default.svg"), SVG)
    mkdirSync(join(home, "other"), { recursive: true })
    writeFileSync(
      join(home, "other", "character.json"),
      JSON.stringify({
        portraits: { default: "portrait.svg" },
        background: { image: "background.png", veil: 0.5 },
      }),
    )
    writeFileSync(join(home, "other", "portrait.svg"), SVG)
    writeFileSync(join(home, "other", "background.png"), PNG_BYTES)
    // 定義に載っていないファイル（配ってはいけない）。
    writeFileSync(join(home, "other", "secret.svg"), SVG)

    const packs = listCharacterPacks(cwd, { bundled, home })
    const current = packs.find((pack) => pack.name === "spirit")
    if (current === undefined) {
      throw new Error("テストの前提: spirit が一覧に無い")
    }
    const event = characterChangedEvent(current, packs, cwd)
    const otherEntry =
      event.kind === "character-changed"
        ? event.packs.find((entry) => entry.name === "other")
        : undefined
    const portrait = otherEntry?.character.portraits?.default
    const background = otherEntry?.character.background?.image
    if (portrait === undefined || background === undefined) {
      throw new Error("テストの前提: other の立ち絵と背景が一覧に無い")
    }

    const server = await startView((location, version) =>
      readCharacterAsset(current, packs, location, version),
    )
    return { server, other: { portrait, background } }
  }

  it("使用中以外のパックの立ち絵を、一覧に載った URL のまま GET すると200で配る", async () => {
    const { server, other } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}${other.portrait}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/svg+xml")
    expect(await response.text()).toBe(SVG)
  })

  it("使用中以外のパックの背景も200で配る", async () => {
    const { server, other } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}${other.background}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it("そのパックの定義に無いファイル名は、ディスクにあっても404", async () => {
    const { server } = await startWithPacks()

    const response = await fetch(`${viewOrigin(server)}/character/other/secret.svg`)

    expect(response.status).toBe(404)
  })

  it("`..` を含む名前は404（エンコードしたものも、生のままのものも）", async () => {
    const { server } = await startWithPacks()
    const origin = viewOrigin(server)

    // fetch は生の `..` を送る前に畳んでしまうので、エンコードした形と node:http の生の経路で送る。
    expect((await fetch(`${origin}/character/other/..%2Fother%2Fsecret.svg`)).status).toBe(404)
    expect((await fetch(`${origin}/character/..%2Fhome%2Fother/portrait.svg`)).status).toBe(404)
    expect(await rawStatus(origin, "/character/../other/portrait.svg")).toBe(404)
    expect(await rawStatus(origin, "/character/other/../spirit/default.svg")).toBe(404)
  })
})

/** 経路を畳まずにそのまま送り、応答の状態コードだけを返す（`fetch` は `..` を送る前に畳むため）。 */
function rawStatus(origin: string, path: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = get(`${origin}/`, { path }, (response) => {
      response.resume()
      resolve(response.statusCode)
    })
    request.on("error", reject)
  })
}
