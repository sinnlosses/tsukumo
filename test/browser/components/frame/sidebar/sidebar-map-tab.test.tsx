import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Sidebar } from "../../../../../src/browser/components/frame/sidebar/sidebar.tsx"
import { useArchitectureMapSelection } from "../../../../../src/browser/features/architecture-map/architecture-map-selection.ts"
import type {
  MapView,
  MapViewBox,
  MapViewResponse,
} from "../../../../../src/shared/architecture-map/map-view.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../query-client.tsx"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../rpc-fetch-stub.ts"
import { putSession } from "../../../session-store.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
  useArchitectureMapSelection.setState({
    selected: undefined,
    lit: undefined,
    expanded: false,
    sidebarTab: "tasks",
    unseenPointCount: 0,
  })
})

function box(id: string, overrides: Partial<MapViewBox> = {}): MapViewBox {
  return {
    id,
    title: id,
    level: 1,
    external: false,
    hasChildren: true,
    paths: [],
    problems: [],
    ...overrides,
  }
}

const WHOLE: MapView = {
  level: 1,
  boxes: [
    box("alpha", {
      title: "アルファ",
      summary: "架空の受け持ち",
      purpose: "架空の理由",
      overview: "架空の概要の文",
      paths: ["src/alpha/**"],
      links: { terms: ["架空の用語"], adr: ["0001-架空"] },
    }),
    box("beta", { title: "ベータ" }),
  ],
  edges: [{ from: "alpha", to: "beta", count: 4, undeclared: false }],
  intendedEdges: [],
  closedCount: 0,
  findings: [],
}

const SMALL: MapView = {
  level: 3,
  focus: { id: "alpha/part", title: "部品の箱", summary: "親の役割", level: 2 },
  boxes: [box("alpha/part/leaf", { title: "葉の箱", level: 3, hasChildren: false })],
  edges: [],
  intendedEdges: [],
  closedCount: 0,
  findings: [],
}

function ready(): MapViewResponse {
  return {
    kind: "ready",
    source: { producer: "架空 0.0.1", commit: "abc" },
    overview: "架空のリポジトリの概要",
    view: WHOLE,
  }
}

function renderSidebar(reply: RpcStubReply, stateOverrides = {}): void {
  fetchStub = stubRpcFetch((call) =>
    call.procedure.includes("architectureMap") ? reply : rpcError(500),
  )
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Sidebar />
    </QueryClientProvider>,
  )
}

describe("Sidebar の地図のタブ", () => {
  it("地図が無いときはタブの列を出さない", async () => {
    renderSidebar(rpcOutput({ kind: "absent" }))

    await waitFor(() => {
      expect(fetchStub?.calls().some((call) => call.procedure.includes("architectureMap"))).toBe(
        true,
      )
    })
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByRole("region", { name: "タスク" })).toBeTruthy()
  })

  it("地図の手続きが失敗してもタブの列を出さない", () => {
    renderSidebar(rpcError(500))

    expect(screen.queryByRole("tablist")).toBeNull()
  })

  it.each([
    ["newer-version", "新しい版"],
    ["not-json", "JSON ではありません"],
  ] as const)("読めない理由 %s は、地図のタブに理由の1行だけを出す", async (reason, text) => {
    renderSidebar(rpcOutput({ kind: "unreadable", reason }))

    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))

    expect((await screen.findByText(new RegExp(text))).tagName).toBe("P")
    expect(screen.queryByRole("button", { name: "広げる" })).toBeNull()
  })

  it("雑談中はタブの列を出さない", async () => {
    renderSidebar(rpcOutput(ready()), { chatMode: true })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole("tablist")).toBeNull()
  })

  it("タスクのタブで探す欄に打った字は、地図のタブへ替えて戻っても残る", async () => {
    renderSidebar(rpcOutput(ready()))
    const search = screen.getByRole("combobox", { name: "タスクを探す" })
    fireEvent.change(search, { target: { value: "架空の語" } })

    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
    fireEvent.click(screen.getByRole("tab", { name: "タスク" }))

    const back = screen.getByRole("combobox", { name: "タスクを探す" })
    expect(back instanceof HTMLInputElement && back.value).toBe("架空の語")
  })

  it("何も選ばないとリポジトリの概要を出し、決定の記録の語は出さない", async () => {
    renderSidebar(rpcOutput(ready()))

    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))

    expect(await screen.findByText("架空のリポジトリの概要")).toBeTruthy()
    expect(screen.getByRole("button", { name: "広げる" })).toBeTruthy()
  })

  it("ミニマップで箱を押すと役割・目的・概要・置き場・用語・つながりが出て、adr の字は出ない", async () => {
    renderSidebar(rpcOutput(ready()))
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))

    fireEvent.click(await screen.findByRole("button", { name: "アルファ" }))

    const text = screen.getByRole("region", { name: "アルファの説明" }).textContent
    expect(text).toContain("架空の受け持ち")
    expect(text).toContain("架空の理由")
    expect(text).toContain("架空の概要の文")
    expect(text).toContain("src/alpha/**")
    expect(text).toContain("架空の用語")
    expect(text).toContain("ベータへ 4本")
    expect(text).not.toContain("0001-架空")
  })

  describe("ファイル数と子モジュール数の札", () => {
    async function descriptionOf(overrides: Partial<MapViewBox>): Promise<string> {
      renderSidebar(
        rpcOutput({
          ...ready(),
          view: { ...WHOLE, boxes: [box("alpha", { title: "アルファ", ...overrides })] },
        }),
      )
      fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
      fireEvent.click(await screen.findByRole("button", { name: "アルファ" }))
      return screen.getByRole("region", { name: "アルファの説明" }).textContent
    }

    it("数があると「1,032 files」と「子モジュール 18」が出る", async () => {
      const text = await descriptionOf({ fileCount: 1032, childCount: 18 })

      expect(text).toContain("1,032 files")
      expect(text).toContain("子モジュール 18")
    })

    it("子が 0 の箱は子モジュールの札を出さない", async () => {
      const text = await descriptionOf({ fileCount: 5, childCount: 0, hasChildren: false })

      expect(text).toContain("5 files")
      expect(text).not.toContain("子モジュール")
    })

    it("外の世界の箱は札を出さない", async () => {
      const text = await descriptionOf({ external: true, fileCount: 5, childCount: 3 })

      expect(text).not.toContain("files")
      expect(text).not.toContain("子モジュール")
    })
  })

  it("ADR の節に番号と題が並び、行を押すとそのパスで host.openFile を1回送る", async () => {
    const sent: unknown[] = []
    fetchStub = stubRpcFetch((call) =>
      call.procedure.includes("architectureMap")
        ? rpcOutput({
            ...ready(),
            view: {
              ...WHOLE,
              boxes: [
                box("alpha", {
                  title: "アルファ",
                  adrs: [
                    { path: "notes/0001-a.txt", number: "0001", title: "架空の第1の決定" },
                    { path: "notes/9-b.txt", title: "notes/9-b.txt" },
                  ],
                }),
              ],
            },
          })
        : rpcError(500),
    )
    putSession({ ...INITIAL_SESSION_STATE }, (command) => {
      if (command.procedure === "host.openFile") {
        sent.push(command.path)
      }
    })
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Sidebar />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
    fireEvent.click(await screen.findByRole("button", { name: "アルファ" }))

    const region = screen.getByRole("region", { name: "アルファの説明" })
    expect(region.textContent).toContain("ADR")
    expect(screen.getByRole("button", { name: "notes/9-b.txt" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "0001 架空の第1の決定" }))

    await waitFor(() => {
      expect(sent).toEqual(["notes/0001-a.txt"])
    })
  })

  it("パスは畳んだ1件を出し、3件を超える箱は「ほか n 件」を押すと全部が出る", async () => {
    const many = ["a/**", "b/**", "c/**", "d/**", "e/**"]
    fetchStub = stubRpcFetch((call) =>
      call.procedure.includes("architectureMap")
        ? rpcOutput({
            ...ready(),
            view: {
              ...WHOLE,
              boxes: [
                box("alpha", {
                  title: "アルファ",
                  paths: ["src/alpha/a/*"],
                  foldedPaths: ["src/alpha/**"],
                }),
                box("beta", { title: "ベータ", paths: many, foldedPaths: many }),
              ],
            },
          })
        : rpcError(500),
    )
    putSession({ ...INITIAL_SESSION_STATE })
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Sidebar />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))

    fireEvent.click(await screen.findByRole("button", { name: "アルファ" }))
    const alpha = screen.getByRole("region", { name: "アルファの説明" }).textContent
    expect(alpha).toContain("パス")
    expect(alpha).toContain("src/alpha/**")
    expect(alpha).not.toContain("src/alpha/a/*")

    fireEvent.click(screen.getByRole("button", { name: "ベータ" }))
    expect(screen.getByRole("region", { name: "ベータの説明" }).textContent).not.toContain("d/**")
    fireEvent.click(screen.getByRole("button", { name: "ほか 2 件" }))
    expect(screen.getByRole("region", { name: "ベータの説明" }).textContent).toContain("e/**")
  })

  it("会話で小の箱を指すと、ミニマップが親の図に替わり、触れている箱に data-lit が付く", async () => {
    renderSidebar(rpcOutput(ready()))
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
    const leaf = SMALL.boxes[0]
    if (leaf === undefined) {
      throw new Error("小の箱が無い")
    }

    act(() => {
      useArchitectureMapSelection.getState().pointBox(leaf, SMALL)
      useArchitectureMapSelection.getState().setLit(leaf.id)
    })

    const node = await screen.findByRole("button", { name: "葉の箱" })
    expect(node.getAttribute("data-lit")).toBe("true")
    expect(screen.queryByRole("button", { name: "アルファ" })).toBeNull()
  })

  it("何も選んでいないとき、図に無い小の箱のバッジに触れると親の図に替わって data-lit が付き、離れると戻る", async () => {
    renderSidebar(rpcOutput(ready()))
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
    const leaf = SMALL.boxes[0]
    if (leaf === undefined) {
      throw new Error("小の箱が無い")
    }

    act(() => {
      useArchitectureMapSelection.getState().setLit(leaf.id)
      useArchitectureMapSelection.getState().setLitView(leaf.id, SMALL)
    })

    const node = await screen.findByRole("button", { name: "葉の箱" })
    expect(node.getAttribute("data-lit")).toBe("true")
    expect(useArchitectureMapSelection.getState().selected).toBeUndefined()
    expect(useArchitectureMapSelection.getState().unseenPointCount).toBe(0)

    act(() => {
      useArchitectureMapSelection.getState().clearLit()
    })
    expect(await screen.findByRole("button", { name: "アルファ" })).toBeTruthy()
  })

  it("タスクのタブで箱を指されると、タブは替わらず地図のタブに点と件数が付き、開くと消える", async () => {
    renderSidebar(rpcOutput(ready()))
    const mapTab = await screen.findByRole("tab", { name: "地図" })
    const alpha = WHOLE.boxes[0]
    if (alpha === undefined) {
      throw new Error("箱が無い")
    }

    act(() => {
      useArchitectureMapSelection.getState().pointBox(alpha, WHOLE)
    })

    expect(screen.getByRole("tab", { name: /タスク/ }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByTestId("sidebar-map-tab-point").textContent).toBe("1")
    fireEvent.click(mapTab)
    expect(screen.queryByTestId("sidebar-map-tab-point")).toBeNull()
    expect(useArchitectureMapSelection.getState().unseenPointCount).toBe(0)
  })

  it("地図のタブを開いているあいだに指されても件数は増えない", async () => {
    renderSidebar(rpcOutput(ready()))
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
    const alpha = WHOLE.boxes[0]
    if (alpha === undefined) {
      throw new Error("箱が無い")
    }

    act(() => {
      useArchitectureMapSelection.getState().pointBox(alpha, WHOLE)
    })

    expect(useArchitectureMapSelection.getState().unseenPointCount).toBe(0)
  })

  it("小の箱を選ぶと、親の箱の名前と summary が添えられる", async () => {
    renderSidebar(rpcOutput(ready()))
    fireEvent.click(await screen.findByRole("tab", { name: "地図" }))
    const leaf = SMALL.boxes[0]
    if (leaf === undefined) {
      throw new Error("小の箱が無い")
    }

    useArchitectureMapSelection.getState().selectBox({ box: leaf, view: SMALL, by: "screen" })

    const text = (await screen.findByRole("region", { name: "葉の箱の説明" })).textContent
    expect(text).toContain("部品の箱")
    expect(text).toContain("親の役割")
  })
})
