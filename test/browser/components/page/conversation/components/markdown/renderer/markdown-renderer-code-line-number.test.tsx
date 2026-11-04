import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CodeFence } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import type { CodeBlockStart } from "../../../../../../../../src/shared/repository/code-block-start.ts"
import { UNREADABLE_FILE_EXCERPT } from "../../../../../../../../src/shared/repository/file-excerpt.ts"
import {
  stubRepositoryFileLink,
  type RepositoryFileLinkStub,
} from "../../../../../../../fixture/repository-file-link.tsx"

let stub: RepositoryFileLinkStub | undefined

afterEach(() => {
  cleanup()
  stub?.restore()
  stub = undefined
  vi.unstubAllGlobals()
})

const SOURCE = Array.from({ length: 5 }, (_, index) => `const v${String(index)} = ${String(index)}`)
  .join("\n")
  .concat("\n")

function drawn(
  props: { readonly path: string; readonly language?: string; readonly marks?: boolean },
  answer: CodeBlockStart,
) {
  stub = stubRepositoryFileLink(["src/fictional.ts"], UNREADABLE_FILE_EXCERPT, answer)
  return render(
    stub.wrap(
      <CodeFence
        language={props.language ?? "ts"}
        path={props.path}
        marks={props.marks === true ? [{ lines: "2", label: "架空の印" }] : []}
        source={SOURCE}
        lineDiff={undefined}
      />,
    ),
  )
}

function lineNumbers(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("[data-line]")).map((row) =>
    row.getAttribute("data-line"),
  )
}

describe("Code の行番号", () => {
  it("始まりの行が分かると、行ごとの器に始まりから連番の data-line が付く", async () => {
    const { container } = drawn({ path: "src/fictional.ts" }, { kind: "line", startLine: 40 })

    await waitFor(() => {
      expect(lineNumbers(container)).toEqual(["40", "41", "42", "43", "44"])
    })
  })

  it("印のある塊も、印の行を含めて始まりから数える", async () => {
    const { container } = drawn(
      { path: "src/fictional.ts", marks: true },
      { kind: "line", startLine: 10 },
    )

    await waitFor(() => {
      expect(lineNumbers(container)).toEqual(["10", "11", "12", "13", "14"])
    })
  })

  it("応答が unknown なら行番号は出ず、今の pre のまま", async () => {
    const { container } = drawn({ path: "src/fictional.ts" }, { kind: "unknown" })

    await waitFor(() => {
      expect(stub?.codeBlockStartRequests).toHaveLength(1)
    })
    expect(container.querySelectorAll("[data-line]")).toHaveLength(0)
    expect(container.querySelector("pre")?.textContent).toBe(SOURCE)
  })

  it("管理下でないパス・パスの無い塊は聞かず、行番号も出ない", async () => {
    const other = drawn({ path: "src/other.ts" }, { kind: "line", startLine: 40 })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(stub?.codeBlockStartRequests).toEqual([])
    expect(other.container.querySelectorAll("[data-line]")).toHaveLength(0)
    cleanup()
    stub?.restore()

    const none = drawn({ path: "" }, { kind: "line", startLine: 40 })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(stub?.codeBlockStartRequests).toEqual([])
    expect(none.container.querySelectorAll("[data-line]")).toHaveLength(0)
  })

  it("diff の塊には、応答が line でも行番号を出さない", async () => {
    const { container } = drawn(
      { path: "src/fictional.ts", language: "diff" },
      { kind: "line", startLine: 40 },
    )

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(container.querySelectorAll("[data-line]")).toHaveLength(0)
  })

  it("コマンドの行のある shell の塊には、応答が line でも行番号を出さない", async () => {
    stub = stubRepositoryFileLink(["src/fictional.ts"], UNREADABLE_FILE_EXCERPT, {
      kind: "line",
      startLine: 40,
    })
    const { container } = render(
      stub.wrap(
        <CodeFence
          language="bash"
          path="src/fictional.ts"
          marks={[]}
          source={"$ pnpm run check\nok\n"}
          lineDiff={undefined}
        />,
      ),
    )

    await waitFor(() => {
      expect(stub?.codeBlockStartRequests).toHaveLength(1)
    })
    expect(container.querySelectorAll("[data-line]")).toHaveLength(0)
  })

  it("diff の塊は、追加・削除の行も文脈の行も、記号の列を持ち、字は原文のまま", () => {
    stub = stubRepositoryFileLink([], UNREADABLE_FILE_EXCERPT)
    const { container } = render(
      stub.wrap(
        <CodeFence
          language="diff"
          path=""
          marks={[]}
          source={"-const a = 1\n+const a = 2\n const b = 3\n"}
          lineDiff={undefined}
        />,
      ),
    )

    const signs = Array.from(container.querySelectorAll('[class*="code-line-sign"]'))
    expect(signs.map((sign) => sign.textContent)).toEqual(["-", "+", " "])
    expect(container.querySelector("pre")?.textContent).toBe("-const a = 1+const a = 2 const b = 3")
  })

  it("コピーのボタンは行番号を含めず、原文をそのまま写す", async () => {
    const written: string[] = []
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })
    const { container } = drawn({ path: "src/fictional.ts" }, { kind: "line", startLine: 40 })
    await waitFor(() => {
      expect(lineNumbers(container)).toHaveLength(5)
    })

    const button = container.querySelector("button")
    if (button === null) {
      throw new Error("写しボタンが無い")
    }
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })

    expect(written).toEqual([SOURCE.replace(/\n$/, "")])
  })
})
