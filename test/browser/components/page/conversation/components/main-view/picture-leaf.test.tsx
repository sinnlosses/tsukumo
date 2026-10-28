import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { ReportImageSource } from "../../../../../../../src/shared/report/report-image-markdown.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const SHELVED: ReportImageSource = {
  kind: "shelved",
  toolUseId: "toolu_1",
  sizes: [{ path: "/tmp/架空の画面.png", width: 640, height: 480 }],
  unshelved: ["/tmp/置けない.png"],
}

function pair(path: string, notes: readonly string[], caption = "架空の画面", fold = "") {
  const fields = { path, caption, notes: [...notes] }
  return {
    block: { kind: "image", ...fields, fold, aside: "" } as const,
    part: { id: "p1", component: "Picture", ...fields, fold, aside: "" } as const,
  }
}

describe("Picture の部品", () => {
  it.each([
    ["棚にある画像（寸法あり）", SHELVED, "/tmp/架空の画面.png", []],
    ["棚にある画像（寸法なし）", SHELVED, "/tmp/別の画面.png", []],
    ["棚に置けなかった画像（札）", SHELVED, "/tmp/置けない.png", []],
    ["棚に置いていない本文（札）", { kind: "none" }, "/tmp/架空の画面.png", []],
    ["注つき", SHELVED, "/tmp/架空の画面.png", ["左上の `a.ts` の帯", "2 行目のラベル"]],
  ] as const)("%s が旧い描画と一致する", (_, source, path, notes) => {
    const { block, part } = pair(path, notes)

    expect(newLeafHtml(block, part, source)).toBe(oldLeafHtml(block, source))
  })

  it("題が空なら代替テキストは「画面の画像」、畳みは題の包みごと", () => {
    const { block, part } = pair("/tmp/架空の画面.png", [], "", "架空の畳み")
    const fresh = newLeafHtml(block, part, SHELVED)

    expect(fresh).toContain('alt="画面の画像"')
    expect(fresh).toBe(oldLeafHtml(block, SHELVED))
  })

  it("画像の src は棚の経路だけで、棚に置かないものには付けない", () => {
    const shelved = pair("/tmp/架空の画面.png", [])
    const none = pair("/tmp/架空の画面.png", [])

    expect(newLeafHtml(shelved.block, shelved.part, SHELVED)).toContain("/report-image/toolu_1/")
    expect(newLeafHtml(none.block, none.part, { kind: "none" })).not.toContain("<img")
  })
})
