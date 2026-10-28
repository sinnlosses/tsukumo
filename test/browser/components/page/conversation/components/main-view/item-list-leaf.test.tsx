import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type Style = "bullet" | "ordered" | "check" | "flow" | "cards"

type ItemFields = {
  label?: string
  text: string
  done?: boolean
  source?: string
  branch?: string
  branchTone?: "ok" | "warn" | "ng"
}

function items(fields: readonly ItemFields[]) {
  return fields.map((item) => ({
    label: item.label ?? "",
    text: item.text,
    done: item.done ?? false,
    source: item.source ?? "",
    branch: item.branch ?? "",
    branchTone: item.branchTone ?? ("warn" as const),
  }))
}

function pair(style: Style, fields: readonly ItemFields[], fold = "") {
  const list = items(fields)
  return {
    block: { kind: "list", style, items: list, fold, aside: "" } as const,
    part: { id: "l1", component: "ItemList", style, items: list, fold, aside: "" } as const,
  }
}

function both(style: Style, fields: readonly ItemFields[], fold = "") {
  const { block, part } = pair(style, fields, fold)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const MANY = Array.from({ length: 12 }, (_, index) => ({ text: `架空の項目${String(index + 1)}` }))

describe("ItemList の部品", () => {
  it.each([
    ["bullet", [{ text: "架空の **太字** と `a.ts`" }, { text: "架空の二つ目" }]],
    ["ordered", [{ text: "架空の一" }, { text: "架空の二 {{3 / 5}}" }]],
    ["check", [{ text: "架空の済み", done: true }, { text: "架空の未了" }]],
    [
      "bullet",
      [
        { label: "架空の名前", text: "架空の説明 `b.ts`" },
        { label: "", text: "名前の無い項目" },
      ],
    ],
    [
      "ordered",
      [
        { label: "架空の名前一", text: "説明一" },
        { label: "架空の名前二", text: "説明二" },
      ],
    ],
    [
      "check",
      [
        { label: "架空の名前", text: "説明", done: true },
        { label: "別の名前", text: "別の説明" },
      ],
    ],
    ["flow", [{ text: "架空の一段目" }, { text: "架空の二段目 `x`" }, { text: "三段目" }]],
    [
      "flow",
      [
        { label: "名前", text: "架空の一段目" },
        {
          text: "架空の二段目",
          source: "src/a.ts",
          branch: "違反あり → 差し戻し",
          branchTone: "ng",
        },
        { text: "三段目", branch: "通る", branchTone: "ok" },
        { text: "四段目", branch: "注意" },
      ],
    ],
    ["flow", [{ text: "あ".repeat(60) }, { text: "い" }]],
    [
      "cards",
      [
        { label: "架空の甲", text: "甲の説明 `c.ts`" },
        { label: "架空の乙", text: "乙の説明" },
      ],
    ],
  ] as const)("%s の形が旧い描画と一致する", (style, fields) => {
    const { fresh, old } = both(style, fields)

    expect(fresh).toBe(old)
  })

  it("fold つきは details で包む", () => {
    const { fresh, old } = both("bullet", [{ text: "架空の項目" }], "架空の根拠")

    expect(fresh).toContain("<details>")
    expect(fresh).toBe(old)
  })

  it.each(["bullet", "ordered", "check"] as const)("%s は 10 件ちょうどなら畳まない", (style) => {
    const { fresh, old } = both(style, MANY.slice(0, 10))

    expect(fresh).not.toContain("ほか")
    expect(fresh).toBe(old)
  })

  it.each(["bullet", "ordered"] as const)(
    "%s は 11 件以上で 10 件に畳み、旧い描画と同じ形で、押すと全部出る",
    (style) => {
      const { block, part } = pair(style, MANY)
      expect(newLeafHtml(block, part)).toBe(oldLeafHtml(block))

      const view = directLeafViewOf(part)
      const { container } = render(
        <div data-report-region="section">
          {view !== undefined && (
            <DirectLeaf
              part={part}
              imageSource={{ kind: "none" }}
              value={{
                captionNumber: { kind: "none" },
                tagTones: {},
                gutterNotes: [],
                mergedIntoPrevious: false,
                children: [],
              }}
              view={view}
            />
          )}
        </div>,
      )
      expect(container.querySelectorAll("li")).toHaveLength(11)
      fireEvent.click(screen.getByRole("button", { name: "ほか 2 件" }))

      expect(container.querySelectorAll("li")).toHaveLength(12)
    },
  )

  it("check と flow と cards は 11 件以上でも畳まない", () => {
    const check = both("check", MANY)
    const flow = both("flow", MANY)
    const cards = both(
      "cards",
      MANY.map((item) => ({ label: "名", text: item.text })),
    )

    expect(check.fresh).not.toContain("ほか")
    expect(check.fresh).toBe(check.old)
    expect(flow.fresh).not.toContain("ほか")
    expect(flow.fresh).toBe(flow.old)
    expect(cards.fresh).toBe(cards.old)
  })
})
