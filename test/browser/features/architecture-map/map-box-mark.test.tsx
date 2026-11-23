import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useArchitectureMapSelection } from "../../../../src/browser/features/architecture-map/architecture-map-selection.ts"
import { MapMarkText } from "../../../../src/browser/features/architecture-map/map-box-mark.tsx"
import { createTestQueryClient } from "../../query-client.tsx"
import {
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../rpc-fetch-stub.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
  useArchitectureMapSelection.setState({
    selected: undefined,
    lit: undefined,
    sidebarTab: "tasks",
    unseenPointCount: 0,
  })
})

const READY = rpcOutput({
  kind: "ready",
  boxes: [
    { id: "app", title: "アプリ", level: 1, aliases: ["frontend"] },
    { id: "app/ui", title: "部品", level: 2, parent: "app", aliases: [] },
    { id: "src/ui/part", title: "src/ui/part", level: 3, parent: "app/ui", aliases: [] },
  ],
})

function renderText(text: string, reply: RpcStubReply): HTMLElement {
  fetchStub = stubRpcFetch(() => reply)
  const { container } = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <p>
        <MapMarkText text={text} />
      </p>
    </QueryClientProvider>,
  )
  return container
}

describe("MapMarkText", () => {
  it("知っている ID と別名は、表示名と縮尺のバッジになる", async () => {
    const container = renderText("見て {{map: app/ui}} と {{map: frontend}} を", READY)

    await waitFor(() => {
      expect(screen.getAllByTestId("map-box-badge")).toHaveLength(2)
    })
    const badges = screen.getAllByTestId("map-box-badge").map((badge) => badge.textContent)
    expect(badges).toEqual(["部品中", "アプリ大"])
    expect(container.textContent).not.toContain("{{map:")
  })

  it("知らない ID は字のまま残る", async () => {
    const container = renderText("見て {{map: nowhere}} を", READY)

    await waitFor(() => {
      expect(fetchStub?.calls().length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(container.textContent).toBe("見て {{map: nowhere}} を")
    })
    expect(screen.queryByTestId("map-box-badge")).toBeNull()
  })

  it.each([
    ["absent", { kind: "absent" }],
    ["unreadable", { kind: "unreadable", reason: "not-json" }],
  ])("地図が %s のときは字のまま残る", async (_, output) => {
    const container = renderText("見て {{map: app}} を", rpcOutput(output))

    await waitFor(() => {
      expect(fetchStub?.calls().length).toBeGreaterThan(0)
    })
    expect(container.textContent).toBe("見て {{map: app}} を")
    expect(screen.queryByTestId("map-box-badge")).toBeNull()
  })

  it("触れると lit を置き、離れると外す。押しても外側の行へ届かない", async () => {
    fetchStub = stubRpcFetch((call) =>
      call.procedure.endsWith("boxes") ? READY : rpcOutput({ kind: "absent" }),
    )
    let outerClicks = 0
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          onClick={() => {
            outerClicks += 1
          }}
        >
          <MapMarkText text="{{map: app}}" />
        </div>
      </QueryClientProvider>,
    )
    const badge = await screen.findByTestId("map-box-badge")
    const touch = badge.closest("button")
    if (touch === null) {
      throw new Error("バッジを包むボタンが無い")
    }

    fireEvent.pointerEnter(touch)
    expect(useArchitectureMapSelection.getState().lit).toBe("app")
    fireEvent.pointerLeave(touch)
    expect(useArchitectureMapSelection.getState().lit).toBeUndefined()
    fireEvent.click(touch)
    expect(outerClicks).toBe(0)
    expect(useArchitectureMapSelection.getState().unseenPointCount).toBe(0)
    expect(useArchitectureMapSelection.getState().selected).toBeUndefined()
  })

  it("図に無い中の箱に触れると、親の図を引いて litView に置く（選びも件数も変えない）", async () => {
    fetchStub = stubRpcFetch((call) =>
      call.procedure.endsWith("boxes")
        ? READY
        : rpcOutput({
            kind: "ready",
            source: { producer: "架空 0.0.1", commit: "abc" },
            view: {
              level: 2,
              focus: { id: "app", title: "アプリ", level: 1 },
              boxes: [
                {
                  id: "app/ui",
                  title: "部品",
                  level: 2,
                  external: false,
                  hasChildren: false,
                  paths: [],
                  problems: [],
                },
              ],
              edges: [],
              intendedEdges: [],
              closedCount: 0,
              findings: [],
            },
          }),
    )
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MapMarkText text="{{map: app/ui}}" />
      </QueryClientProvider>,
    )
    const touch = (await screen.findByTestId("map-box-badge")).closest("button")
    if (touch === null) {
      throw new Error("バッジを包むボタンが無い")
    }

    fireEvent.pointerEnter(touch)

    await waitFor(() => {
      expect(useArchitectureMapSelection.getState().litView?.focus?.id).toBe("app")
    })
    expect(useArchitectureMapSelection.getState().selected).toBeUndefined()
    expect(useArchitectureMapSelection.getState().unseenPointCount).toBe(0)
    fireEvent.pointerLeave(touch)
    expect(useArchitectureMapSelection.getState().litView).toBeUndefined()
  })

  it("ほかの印と壊れた印は字のまま残る", async () => {
    const text = "{{3 / 5}} と {{12 → 8}} と {{ と {{map: app}}"
    renderText(text, READY)

    await waitFor(() => {
      expect(screen.getAllByTestId("map-box-badge")).toHaveLength(1)
    })
    expect(document.body.textContent).toContain("{{3 / 5}} と {{12 → 8}} と {{ と ")
  })
})
