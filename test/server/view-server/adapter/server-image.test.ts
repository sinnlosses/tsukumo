import { afterEach, describe, expect, it } from "vitest"

import {
  createStartupToken,
  type ViewServer,
} from "../../../../src/server/view-server/adapter/server.ts"
import { reportImagePath } from "../../../../src/shared/report/report-image.ts"
import { promptImagePath } from "../../../../src/shared/session-driver/prompt-image.ts"
import {
  closeRunningView,
  noCharacterAsset,
  noPromptImage,
  startView,
  TOKEN,
  viewOrigin,
} from "../../../fixture/view-server.ts"

afterEach(closeRunningView)

describe("startViewServer", () => {
  describe("/prompt-image/<id>", () => {
    // 棚に置いた原寸の代役。中身は手で書いた数バイト（実物の画像は使わない）。
    const SHELVED_ID = "0b6f7a52-3c1e-4d7a-9f2b-5e8c1d4a6b3f"
    const SHELVED_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])
    const SHELVED_DATA_URL = `data:image/png;base64,${SHELVED_BYTES.toString("base64")}`

    function promptImageUrl(server: ViewServer, id: string, token: string | undefined): string {
      const path = `${viewOrigin(server)}${promptImagePath(id)}`
      return token === undefined ? path : `${path}?t=${token}`
    }

    function startWithShelf(requested: string[] = []): Promise<ViewServer> {
      return startView(noCharacterAsset, (id) => {
        requested.push(id)
        return id === SHELVED_ID ? SHELVED_DATA_URL : undefined
      })
    }

    it("正しいトークンなら、棚の原寸をデコードして受け取ったときのメディアタイプで配る", async () => {
      const server = await startWithShelf()

      const response = await fetch(promptImageUrl(server, SHELVED_ID, TOKEN))

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(Buffer.from(await response.arrayBuffer())).toEqual(SHELVED_BYTES)
    })

    it("トークンが無い・違うときは 403（棚を引きにも行かない）", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const missing = await fetch(promptImageUrl(server, SHELVED_ID, undefined))
      const wrong = await fetch(promptImageUrl(server, SHELVED_ID, createStartupToken()))

      expect(missing.status).toBe(403)
      expect(wrong.status).toBe(403)
      expect(requested).toEqual([])
    })

    it("棚に無い id（捨てられた原寸）は 404", async () => {
      const server = await startWithShelf()

      const response = await fetch(
        promptImageUrl(server, "7d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", TOKEN),
      )

      expect(response.status).toBe(404)
    })

    it("id の形が違う（UUID でない・上のディレクトリを指す）ときは 404（棚を引きにも行かない）", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const malformed = await fetch(promptImageUrl(server, "not-an-id", TOKEN))
      const traversal = await fetch(
        `${viewOrigin(server)}/prompt-image/..%2F..%2Fetc%2Fpasswd?t=${TOKEN}`,
      )
      const empty = await fetch(promptImageUrl(server, "", TOKEN))

      expect(malformed.status).toBe(404)
      expect(traversal.status).toBe(404)
      expect(empty.status).toBe(404)
      expect(requested).toEqual([])
    })
  })

  describe("/report-image/<toolUseId>/<path>", () => {
    // 棚に置いた画像の代役。中身は手で書いた数バイト（実物の画像は使わない）。
    const SHELVED_TOOL_USE_ID = "toolu_fictional"
    const SHELVED_PATH = "架空/after.png"
    const SHELVED_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])

    function reportImageUrl(server: ViewServer, path: string, token: string | undefined): string {
      const url = `${viewOrigin(server)}${reportImagePath(SHELVED_TOOL_USE_ID, path)}`
      return token === undefined ? url : `${url}?t=${token}`
    }

    function startWithShelf(requested: string[] = []): Promise<ViewServer> {
      return startView(noCharacterAsset, noPromptImage, {}, (toolUseId, path) => {
        requested.push(path)
        return toolUseId === SHELVED_TOOL_USE_ID && path === SHELVED_PATH
          ? { mediaType: "image/png", content: SHELVED_BYTES }
          : undefined
      })
    }

    it("正しいトークンなら、鍵の組が指す棚の画像をそのメディアタイプで配る", async () => {
      const server = await startWithShelf()

      const response = await fetch(reportImageUrl(server, SHELVED_PATH, TOKEN))

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(SHELVED_BYTES)
    })

    it("トークンが無い・違うときは 403（棚を引きにも行かない）", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const missing = await fetch(reportImageUrl(server, SHELVED_PATH, undefined))
      const wrong = await fetch(reportImageUrl(server, SHELVED_PATH, createStartupToken()))

      expect(missing.status).toBe(403)
      expect(wrong.status).toBe(403)
      expect(requested).toEqual([])
    })

    it("棚に無いパスは 404、鍵の形が崩れているときは棚を引きにも行かず 404", async () => {
      const requested: string[] = []
      const server = await startWithShelf(requested)

      const absent = await fetch(reportImageUrl(server, "架空/before.png", TOKEN))
      const noPath = await fetch(`${viewOrigin(server)}/report-image/toolu_fictional?t=${TOKEN}`)
      const badId = await fetch(`${viewOrigin(server)}/report-image/a.b/x.png?t=${TOKEN}`)
      const badEscape = await fetch(
        `${viewOrigin(server)}/report-image/toolu_fictional/%E3?t=${TOKEN}`,
      )

      expect(absent.status).toBe(404)
      expect(noPath.status).toBe(404)
      expect(badId.status).toBe(404)
      expect(badEscape.status).toBe(404)
      expect(requested).toEqual(["架空/before.png"])
    })
  })
})
