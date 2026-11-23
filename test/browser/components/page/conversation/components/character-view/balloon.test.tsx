import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Balloon } from "../../../../../../../src/browser/components/page/conversation/components/character-view/balloon.tsx"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../../../rpc-fetch-stub.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

describe("Balloon の地図の箱の印", () => {
  it("map の印だけが箱のバッジになり、ほかの {{…}} は字のまま残る", async () => {
    fetchStub = stubRpcFetch(() =>
      rpcOutput({
        kind: "ready",
        boxes: [{ id: "app", title: "アプリ", level: 1, aliases: [] }],
      }),
    )
    const { container } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <Balloon
          text="{{map: app}} は {{3 / 5}} 件"
          latest
          time={{ kind: "unknown" }}
          interaction={{ kind: "reaction", reaction: "welcome" }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByTestId("map-box-badge")).toHaveLength(1)
    })
    expect(container.textContent).toBe("アプリ大 は {{3 / 5}} 件")
  })
})
