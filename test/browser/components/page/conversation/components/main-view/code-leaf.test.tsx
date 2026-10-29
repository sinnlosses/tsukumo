import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

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
  vi.unstubAllGlobals()
})

type Mark = { lines: string; label: string }

type Fields = {
  language: string
  path: string
  source: string
  marks: Mark[]
  fold: string
  aside: string
}

function pair(overrides: Partial<Fields>) {
  const fields: Fields = {
    language: "ts",
    path: "",
    source: "const a = 1\nconst b = 2\n",
    marks: [],
    fold: "",
    aside: "",
    ...overrides,
  }
  return {
    block: { kind: "code", ...fields } as const,
    part: { id: "k1", component: "Code", ...fields } as const,
  }
}

function both(overrides: Partial<Fields>) {
  const { block, part } = pair(overrides)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const LONG_SOURCE = Array.from(
  { length: 30 },
  (_, index) => `const v${String(index)} = ${String(index)}`,
).join("\n")

describe("Code の部品", () => {
  it.each([
    ["言語つき", { language: "ts" }],
    ["言語が空でパスなし", { language: "" }],
    ["言語が空でパスあり（text で埋める）", { language: "", path: "src/架空.ts" }],
    ["ファイル名つき", { language: "ts", path: "src/架空.ts" }],
    ["印つき", { source: LONG_SOURCE, marks: [{ lines: "2-3", label: "架空の印" }] }],
    ["印つきでファイル名つき", { path: "src/架空.ts", marks: [{ lines: "1", label: "架空" }] }],
    ["diff", { language: "diff", source: "-const a = 1\n+const a = 2\n context\n" }],
    ["shell のコマンドと出力", { language: "bash", source: "$ pnpm run check\nok 1.2s\n" }],
    ["shell でコマンドの無い塊", { language: "bash", source: "ok 1.2s\n" }],
    ["色の字", { language: "text", source: "#0a84ff" }],
    ["未登録の言語", { language: "foo", source: "架空の文\n2行目" }],
    ["原文が空", { source: "" }],
    ["fold つき", { fold: "架空の畳み" }],
    ["aside つき", { aside: "架空の傍注" }],
    ["fold と aside の両方", { fold: "架空の畳み", aside: "架空の傍注" }],
    ["図の言語の mermaid", { language: "mermaid", source: "sequenceDiagram\n  A->>B: 架空" }],
    [
      "図の言語でパスつき",
      { language: "mermaid", path: "src/架空.md", source: "sequenceDiagram\n  A->>B: 架空" },
    ],
    [
      "言語が空で印だけ（text で埋める）",
      { language: "", source: LONG_SOURCE, marks: [{ lines: "2", label: "架空の印" }] },
    ],
    ["言語が空白だけでパスあり", { language: "  ", path: "src/架空.ts" }],
    ["空白を含むパス", { path: "src/架空 の 名前.ts" }],
    ["前後に空白のあるパス", { path: "  src/架空.ts  " }],
    ["言語に空白の続きがある", { language: "ts 余り", path: "src/架空.ts" }],
    ["パスが空白だけ", { path: "   " }],
  ] as const satisfies readonly (readonly [string, Partial<Fields>])[])(
    "%s が旧い描画と一致する",
    (_name, overrides) => {
      const { fresh, old } = both(overrides)

      expect(fresh).toBe(old)
      expect(fresh).not.toBe("")
    },
  )

  it("原文の全行が textContent に残る", () => {
    const { fresh } = both({ source: LONG_SOURCE })

    const text = fresh.replace(/<[^>]*>/g, "")
    const missing = LONG_SOURCE.split("\n").filter((line) => !text.includes(line))
    expect(missing).toEqual([])
  })

  it("印の行の全部が印の行として残る", () => {
    const marks = [
      { lines: "1", label: "架空A" },
      { lines: "3", label: "架空B" },
    ]
    const { fresh } = both({ marks, source: "const a = 1\nconst b = 2\nconst c = 3\n" })

    expect(marks.filter((mark) => !fresh.includes(mark.label))).toEqual([])
  })
})

async function clickCopy(overrides: Partial<Fields>): Promise<string[]> {
  const written: string[] = []
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: (text: string) => {
        written.push(text)
        return Promise.resolve()
      },
    },
  })
  const { part } = pair(overrides)
  const view = directLeafViewOf(part)
  if (view === undefined) {
    throw new Error("Code の部品が無い")
  }
  const { container } = render(
    <div data-report-region="section">
      <DirectLeaf
        part={part}
        value={{
          captionNumber: { kind: "none" },
          tagTones: {},
          gutterNotes: [],
          mergedIntoPrevious: false,
        }}
        imageSource={{ kind: "none" }}
        view={view}
      />
    </div>,
  )
  const button = container.querySelector("button")
  if (button === null) {
    throw new Error("写しボタンが無い")
  }
  await act(async () => {
    fireEvent.click(button)
    await Promise.resolve()
  })
  return written
}

describe("Code の写しボタン", () => {
  it("通常のコードは原文をそのまま写す", async () => {
    expect(await clickCopy({ source: "const a = 1\nconst b = 2\n" })).toEqual([
      "const a = 1\nconst b = 2",
    ])
  })

  it("shell の塊はコマンドの行だけを `$ ` を外して写す", async () => {
    expect(
      await clickCopy({ language: "bash", source: "$ pnpm run check\nok 1.2s\n$ echo done\n" }),
    ).toEqual(["pnpm run check\necho done"])
  })
})
