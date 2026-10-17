import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FILE_EXCERPT_PEEK_DELAY_MS } from "../../../../../../../src/browser/components/page/conversation/components/repository-link/hooks/use-file-excerpt-peek.ts"
import {
  RepositoryFileLinkContext,
  RepositoryFileLinkTarget,
  repositoryFileTarget,
} from "../../../../../../../src/browser/components/page/conversation/components/repository-link/repository-link.tsx"
import type {
  FileExcerpt,
  FileExcerptRequest,
} from "../../../../../../../src/shared/repository/file-excerpt.ts"

const FILES = new Set(["src/fictional.ts"])

const LINES_AROUND_12 = {
  kind: "lines",
  lines: [9, 10, 11, 12, 13, 14, 15].map((number) => ({
    number,
    text: `架空の行 ${String(number)}`,
    truncated: false,
  })),
} as const satisfies FileExcerpt

type Harness = {
  readonly link: HTMLElement
  readonly opened: readonly string[]
  readonly requests: readonly FileExcerptRequest[]
}

/** `candidate` を押せるパスにして描く。抜き書きの読み口は `excerpt` を返す。 */
function renderLink(candidate: string, excerpt: FileExcerpt = LINES_AROUND_12): Harness {
  const target = repositoryFileTarget(candidate, FILES)
  if (target === undefined) {
    throw new Error(`一覧に無い候補: ${candidate}`)
  }
  const opened: string[] = []
  const requests: FileExcerptRequest[] = []
  render(
    <RepositoryFileLinkContext.Provider
      value={{
        files: FILES,
        open: (path) => opened.push(path),
        readExcerpt: (request) => {
          requests.push(request)
          return Promise.resolve(excerpt)
        },
      }}
    >
      <p>
        見て{" "}
        <RepositoryFileLinkTarget target={target} title={undefined} className="">
          {candidate}
        </RepositoryFileLinkTarget>{" "}
        を直した
      </p>
    </RepositoryFileLinkContext.Provider>,
  )
  return { link: screen.getByRole("button"), opened, requests }
}

/**
 * フォーカスを入れる。キーボードで入ったフォーカスだけがブラウザで `:focus-visible` に当たるので、jsdom ではそれを差し替える。
 * 押して入るフォーカスは `pointer`。
 */
function focusBy(link: HTMLElement, input: "keyboard" | "pointer"): void {
  const matches = Element.prototype.matches.bind(link)
  vi.spyOn(link, "matches").mockImplementation((selector) =>
    selector === ":focus-visible" ? input === "keyboard" : matches(selector),
  )
  fireEvent.focus(link)
}

async function waitPeekDelay(ms: number = FILE_EXCERPT_PEEK_DELAY_MS): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("RepositoryFileLinkTarget（行の抜き書きの浮き）", () => {
  it("重ねて 500ms 経つまでは読まず、経つと前後の行を浮かせて指した行に印を付ける", async () => {
    const { link, requests } = renderLink("src/fictional.ts:12")

    fireEvent.pointerEnter(link, { pointerType: "mouse" })
    await waitPeekDelay(FILE_EXCERPT_PEEK_DELAY_MS - 1)
    expect(requests).toEqual([])
    expect(screen.queryByRole("tooltip")).toBeNull()

    await waitPeekDelay(1)
    expect(requests).toEqual([{ path: "src/fictional.ts", startLine: 12, endLine: 12 }])
    const peek = screen.getByRole("tooltip")
    expect(link.getAttribute("aria-describedby")).toBe(peek.id)
    expect(peek.textContent).toContain("src/fictional.ts · 9〜15 行")
    const pointed = [...peek.querySelectorAll('[data-pointed="true"]')]
    expect(pointed.map((line) => line.textContent)).toEqual(["架空の行 12← 12 行"])
    // 印は行の字の外に置く（長い行で字を省いても印は残る）。
    expect(pointed[0]?.querySelector("[data-line-text]")?.textContent).toBe("架空の行 12")
    expect(pointed[0]?.querySelector("[data-line-mark]")?.textContent).toBe("← 12 行")
    expect(peek.querySelectorAll("[data-pointed]")).toHaveLength(7)
  })

  it("範囲を指したら範囲をそのまま頼み、範囲の行すべてに印を付ける", async () => {
    const { link, requests } = renderLink("src/fictional.ts:11-13")

    focusBy(link, "keyboard")
    await waitPeekDelay()

    expect(requests).toEqual([{ path: "src/fictional.ts", startLine: 11, endLine: 13 }])
    expect(screen.getByRole("tooltip").querySelectorAll('[data-pointed="true"]')).toHaveLength(3)
  })

  it("行番号の無いパスは、重ねても読まず浮きを出さない", async () => {
    const { link, requests } = renderLink("src/fictional.ts")

    fireEvent.pointerEnter(link, { pointerType: "mouse" })
    focusBy(link, "keyboard")
    await waitPeekDelay()

    expect(requests).toEqual([])
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("待っている間に外へ出たら読まない", async () => {
    const { link, requests } = renderLink("src/fictional.ts:12")

    fireEvent.pointerEnter(link, { pointerType: "mouse" })
    await waitPeekDelay(FILE_EXCERPT_PEEK_DELAY_MS / 2)
    fireEvent.pointerLeave(link, { pointerType: "mouse" })
    await waitPeekDelay()

    expect(requests).toEqual([])
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("出た浮きは、外へ出る・フォーカスが外れる・Esc で閉じる", async () => {
    const { link } = renderLink("src/fictional.ts:12")

    fireEvent.pointerEnter(link, { pointerType: "mouse" })
    await waitPeekDelay()
    fireEvent.pointerLeave(link, { pointerType: "mouse" })
    expect(screen.queryByRole("tooltip")).toBeNull()

    focusBy(link, "keyboard")
    await waitPeekDelay()
    fireEvent.blur(link)
    expect(screen.queryByRole("tooltip")).toBeNull()

    focusBy(link, "keyboard")
    await waitPeekDelay()
    expect(screen.getByRole("tooltip")).not.toBeNull()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("触れて（touch）押したときは、重なりと押下で入るフォーカスのどちらでも浮きを出さず、今どおり裸のパスで開く", async () => {
    const { link, requests, opened } = renderLink("src/fictional.ts:12")

    // 叩いたときの順。フォーカスは pointerup のあとの互換の mousedown で入る。
    fireEvent.pointerEnter(link, { pointerType: "touch" })
    fireEvent.pointerDown(link, { pointerType: "touch" })
    fireEvent.pointerUp(link, { pointerType: "touch" })
    fireEvent.mouseDown(link)
    focusBy(link, "pointer")
    fireEvent.mouseUp(link)
    fireEvent.click(link)
    await waitPeekDelay()

    expect(requests).toEqual([])
    expect(screen.queryByRole("tooltip")).toBeNull()
    expect(opened).toEqual(["src/fictional.ts"])
  })

  it("マウスで重ねたまま押して入るフォーカスでは待ちを始め直さず、重ねてからの 500ms で出る", async () => {
    const { link, requests, opened } = renderLink("src/fictional.ts:12")

    fireEvent.pointerEnter(link, { pointerType: "mouse" })
    await waitPeekDelay(300)
    fireEvent.pointerDown(link, { pointerType: "mouse" })
    focusBy(link, "pointer")
    fireEvent.pointerUp(link, { pointerType: "mouse" })
    fireEvent.click(link)
    expect(opened).toEqual(["src/fictional.ts"])

    await waitPeekDelay(FILE_EXCERPT_PEEK_DELAY_MS - 300)
    expect(requests).toHaveLength(1)
    expect(screen.getByRole("tooltip")).not.toBeNull()
  })

  it("マウスで押して外で離したあとでも、キーボードでフォーカスを入れ直せば出る", async () => {
    const { link, requests } = renderLink("src/fictional.ts:12")

    // 押して入ったフォーカスでは待たない。離すのは要素の外なので pointerup は届かない。
    fireEvent.pointerDown(link, { pointerType: "mouse" })
    focusBy(link, "pointer")
    fireEvent.pointerLeave(link, { pointerType: "mouse" })
    fireEvent.pointerUp(document.body, { pointerType: "mouse" })
    await waitPeekDelay()
    expect(requests).toEqual([])

    fireEvent.blur(link)
    focusBy(link, "keyboard")
    await waitPeekDelay()
    expect(requests).toHaveLength(1)
    expect(screen.getByRole("tooltip")).not.toBeNull()
  })

  it("キーボード（Tab）でフォーカスが入ったら、500ms で出る", async () => {
    const { link, requests } = renderLink("src/fictional.ts:12")

    focusBy(link, "keyboard")
    await waitPeekDelay(FILE_EXCERPT_PEEK_DELAY_MS - 1)
    expect(requests).toEqual([])
    await waitPeekDelay(1)

    expect(requests).toHaveLength(1)
    expect(screen.getByRole("tooltip")).not.toBeNull()
  })

  it("指した行がいまのファイルに無ければ、無いことと行数を出す", async () => {
    const { link } = renderLink("src/fictional.ts:40", { kind: "out-of-range", lineCount: 20 })

    focusBy(link, "keyboard")
    await waitPeekDelay()

    expect(screen.getByRole("tooltip").textContent).toContain(
      "40 行目はいまのファイルに無い（20 行まで）",
    )
  })

  it("読めなかったときは浮きを出さない", async () => {
    const { link, requests } = renderLink("src/fictional.ts:12", {
      kind: "unavailable",
      reason: "unreadable",
    })

    focusBy(link, "keyboard")
    await waitPeekDelay()

    expect(requests).toHaveLength(1)
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})

describe("repositoryFileTarget", () => {
  it("末尾の行・行と桁・範囲を指した行にし、裸のパスで照合する", () => {
    expect(repositoryFileTarget("src/fictional.ts:12", FILES)).toEqual({
      path: "src/fictional.ts",
      pointed: { kind: "lines", startLine: 12, endLine: 12 },
    })
    expect(repositoryFileTarget("src/fictional.ts:12:5", FILES)?.pointed).toEqual({
      kind: "lines",
      startLine: 12,
      endLine: 12,
    })
    expect(repositoryFileTarget("src/fictional.ts:10-14", FILES)?.pointed).toEqual({
      kind: "lines",
      startLine: 10,
      endLine: 14,
    })
  })

  it("行の無いパス・0 行目・終わりが頭より前の範囲は、押せるが行を指さない", () => {
    for (const candidate of ["src/fictional.ts", "src/fictional.ts:0", "src/fictional.ts:14-10"]) {
      expect(repositoryFileTarget(candidate, FILES)).toEqual({
        path: "src/fictional.ts",
        pointed: { kind: "none" },
      })
    }
  })

  it("一覧に無いパスは押せない", () => {
    expect(repositoryFileTarget("src/missing.ts:12", FILES)).toBeUndefined()
  })
})
