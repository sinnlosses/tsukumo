import { describe, expect, it } from "bun:test"

import { assembleLayout } from "../../scripts/assemble-layout.ts"
import { type Host, type HostResult, type PaneRequest } from "../../src/host.ts"

// **実際に orca は叩かない。** ポート（src/host.ts）のアダプタをこのフェイクに差し替えて、
// 「どの順に何を頼んだか」だけを記録する（docs/architecture.md「orca-host.ts は自動テストの
// 対象外」— assembleLayout 側の手順はここで固定できる）。

type RecordedCall =
  | { readonly kind: "openPane"; readonly request: PaneRequest }
  | { readonly kind: "showView"; readonly url: string }

function createRecordingHost(): { readonly host: Host; readonly calls: readonly RecordedCall[] } {
  const calls: RecordedCall[] = []

  const host: Host = {
    openPane: (request) => {
      calls.push({ kind: "openPane", request })
      return Promise.resolve({ ok: true })
    },
    showView: (url) => {
      calls.push({ kind: "showView", url })
      return Promise.resolve({ ok: true })
    },
  }

  return { host, calls }
}

function createFailingHost(failing: RecordedCall["kind"]): {
  readonly host: Host
  readonly calls: readonly RecordedCall[]
} {
  const calls: RecordedCall[] = []

  const host: Host = {
    openPane: (request) => {
      calls.push({ kind: "openPane", request })
      const result: HostResult =
        failing === "openPane" ? { ok: false, reason: "テスト用の失敗" } : { ok: true }
      return Promise.resolve(result)
    },
    showView: (url) => {
      calls.push({ kind: "showView", url })
      const result: HostResult =
        failing === "showView" ? { ok: false, reason: "テスト用の失敗" } : { ok: true }
      return Promise.resolve(result)
    },
  }

  return { host, calls }
}

const BASE_URL = "http://127.0.0.1:7327"

describe("assembleLayout", () => {
  it("先に上下で割り、上段と下段をそれぞれ左右に割ってから、対応するビューを開く", async () => {
    const { host, calls } = createRecordingHost()

    await assembleLayout(host, BASE_URL)

    expect(calls).toEqual([
      { kind: "openPane", request: { placement: "below", command: undefined } },
      { kind: "openPane", request: { placement: "beside", command: undefined } },
      { kind: "showView", url: "http://127.0.0.1:7327/main" },
      { kind: "showView", url: "http://127.0.0.1:7327/sidebar" },
      { kind: "openPane", request: { placement: "beside", command: undefined } },
      { kind: "showView", url: "http://127.0.0.1:7327/character" },
    ])
  })

  it("入力ペイン（右下）に対しては何も頼まない。ペイン分割は3回、コマンド起動は一度も無い", async () => {
    const { host, calls } = createRecordingHost()

    await assembleLayout(host, BASE_URL)

    const paneRequests = calls.filter(
      (call): call is Extract<RecordedCall, { readonly kind: "openPane" }> =>
        call.kind === "openPane",
    )
    expect(paneRequests).toHaveLength(3)
    expect(paneRequests.every((call) => call.request.command === undefined)).toBe(true)
  })

  it("ペイン分割が失敗しても、後続の手順は止めずに最後まで進める", async () => {
    const { host, calls } = createFailingHost("openPane")

    const steps = await assembleLayout(host, BASE_URL)

    expect(calls).toHaveLength(6)
    expect(steps.filter((step) => !step.result.ok)).toHaveLength(3)
    expect(steps.filter((step) => step.result.ok)).toHaveLength(3)
  })

  it("ビューを開く手順が失敗しても、後続の手順は止めずに最後まで進める", async () => {
    const { host, calls } = createFailingHost("showView")

    const steps = await assembleLayout(host, BASE_URL)

    expect(calls).toHaveLength(6)
    expect(steps.filter((step) => !step.result.ok)).toHaveLength(3)
    expect(steps.filter((step) => step.result.ok)).toHaveLength(3)
  })

  it("手順ごとの説明が付いていて、どれも空でない", async () => {
    const { host } = createRecordingHost()

    const steps = await assembleLayout(host, BASE_URL)

    expect(steps).toHaveLength(6)
    for (const step of steps) {
      expect(step.description.length).toBeGreaterThan(0)
    }
  })
})
