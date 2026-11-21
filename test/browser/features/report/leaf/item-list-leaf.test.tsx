import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../fixture/direct-leaf-compare.tsx"

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
  it("check は済みを CircleCheck、未了を Circle の線の丸で描く", () => {
    const { fresh } = both("check", [{ text: "架空の済み", done: true }, { text: "架空の未了" }])

    expect(fresh).toContain("check-mark-done")
    expect(fresh).toContain("lucide-circle-check")
    expect(fresh).toContain("check-mark-open")
    expect(fresh).not.toContain("report-task-check")
  })

  it("名前つきは名前をラベル、説明を説明に置き、名前の無い項目は本文をラベルにする", () => {
    const { fresh } = both("bullet", [
      { label: "架空の名前", text: "架空の説明 `b.ts`" },
      { label: "", text: "名前の無い項目" },
    ])

    expect(fresh).toContain("架空の名前")
    expect(fresh).toContain("架空の説明")
    expect(fresh).toContain("名前の無い項目")
    expect(fresh).toContain("astryx-list-item")
    expect(fresh).not.toContain("report-labeled-list")
  })

  it("ordered は番号つきの list で描く", () => {
    const { fresh } = both("ordered", [{ text: "架空の一" }, { text: "架空の二" }])

    expect(fresh).toContain('data-list-style="decimal"')
  })

  it("flow は短い流れを横向き、分岐や長い段のある流れを縦向きの Stepper で描く", () => {
    const short = both("flow", [{ text: "架空の一段目" }, { text: "架空の二段目" }]).fresh
    const branched = both("flow", [
      { text: "架空の一段目" },
      { text: "二段目", branch: "通る" },
    ]).fresh
    const long = both("flow", [{ text: "あ".repeat(60) }, { text: "い" }]).fresh

    expect(short).toContain('aria-label="流れ"')
    expect(short).toContain('data-orientation="horizontal"')
    expect(branched).toContain('data-orientation="vertical"')
    expect(long).toContain('data-orientation="vertical"')
  })

  it("flow の分岐は段の右端に札で残る", () => {
    const { fresh } = both("flow", [
      { label: "名前", text: "架空の一段目", source: "src/a.ts" },
      { text: "架空の二段目", branch: "違反あり → 差し戻し", branchTone: "ng" },
      { text: "三段目", branch: "通る", branchTone: "ok" },
    ])

    expect(fresh).toContain('<span class="verdict-badge">違反あり → 差し戻し')
    expect(fresh).toContain('<span class="verdict-badge">通る')
    expect(fresh).toContain("src/a.ts")
  })

  it("cards の形が旧い描画と一致する", () => {
    const { fresh, old } = both("cards", [
      { label: "架空の甲", text: "甲の説明 `c.ts`" },
      { label: "架空の乙", text: "乙の説明" },
    ])

    expect(fresh).toBe(old)
  })

  it("fold つきは details で包む", () => {
    const { fresh } = both("bullet", [{ text: "架空の項目" }], "架空の根拠")

    expect(fresh).toContain("<details>")
  })

  it.each(["bullet", "ordered", "check"] as const)("%s は 10 件ちょうどなら畳まない", (style) => {
    const { fresh } = both(style, MANY.slice(0, 10))

    expect(fresh).not.toContain("ほか")
  })

  it.each(["bullet", "ordered"] as const)(
    "%s は 11 件以上で 10 件に畳み、押すと全部出る",
    (style) => {
      const { part } = pair(style, MANY)

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
    expect(flow.fresh).not.toContain("ほか")
    expect(cards.fresh).toBe(cards.old)
  })
})
