import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
}

type Item = {
  readonly title: string
  readonly status: "ok" | "ng" | "notStarted"
  readonly supplement: string
  readonly output: string
}

const ITEM: Item = { title: "架空の手", status: "ok", supplement: "", output: "" }

function drawn(extra: {
  readonly items?: readonly Item[]
  readonly fold?: string
  readonly value?: LeafValue
}) {
  const part = {
    id: "r1",
    component: "Trace" as const,
    items: [...(extra.items ?? [ITEM])],
    fold: extra.fold ?? "",
    aside: "",
  }
  const view = directLeafViewOf(part)
  return render(
    <div data-report-region="section">
      {view !== undefined && (
        <DirectLeaf
          part={part}
          imageSource={{ kind: "none" }}
          value={extra.value ?? VALUE}
          view={view}
        />
      )}
    </div>,
  ).container
}

describe("Trace の部品", () => {
  it("行の数だけ ol の li が並び、題・状態の記号と語・補足が出る", () => {
    const container = drawn({
      items: [
        { ...ITEM, title: "架空の **読み込み** を確かめた", supplement: "架空.ts:42" },
        { ...ITEM, title: "架空の取り込み", status: "ng", supplement: "2.1 秒" },
        { ...ITEM, title: "架空の目視", status: "notStarted" },
      ],
    })

    const rows = [...container.querySelectorAll("ol > li")]
    expect(rows).toHaveLength(3)
    expect(rows[0]?.querySelector("strong")?.textContent).toBe("読み込み")
    expect(
      rows.map((row) => {
        const mark = row.querySelector('[role="img"]')
        return [mark?.textContent, mark?.getAttribute("aria-label")]
      }),
    ).toEqual([
      ["✓", "済み"],
      ["✕", "落ちた"],
      ["○", "未着手"],
    ])
    expect(rows[1]?.textContent).toContain("2.1 秒")
  })

  it("出力のある行だけ details で開け、出力は記法を通さず pre にそのまま入る", () => {
    const container = drawn({
      items: [
        { ...ITEM, output: "架空: **太字にならない**\n  2 行目" },
        { ...ITEM, title: "架空の別の手" },
      ],
    })

    const details = [...container.querySelectorAll("li details")]
    expect(details).toHaveLength(1)
    expect(details[0]?.hasAttribute("open")).toBe(false)
    expect(details[0]?.querySelector("summary")?.textContent).toBe("出力を見る")
    expect(details[0]?.querySelector("pre")?.textContent).toBe("架空: **太字にならない**\n  2 行目")
    expect(details[0]?.querySelector("strong")).toBeNull()
  })

  it("fold があれば並びごと details で畳む", () => {
    const container = drawn({ fold: "架空の経過" })

    expect(container.querySelector("details > summary")?.textContent).toBe("架空の経過")
    expect(container.querySelector("details > ol > li")).not.toBeNull()
  })

  it("欄外注があれば欄外注の列に欄外注が付く", () => {
    const container = drawn({
      value: { ...VALUE, gutterNotes: [{ label: "", text: "架空の欄外注" }] },
    })

    expect(container.querySelector("aside")?.textContent).toBe("架空の欄外注")
  })
})
