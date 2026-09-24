import { describe, expect, it } from "bun:test"

import { type HostResult } from "../../../src/server/core/host.ts"
import { openTrackedFile } from "../../../src/server/core/tracked-file.ts"

const TRACKED = ["docs/display.md", "src/cli.ts"]

function recordingOpen(result: HostResult): {
  readonly open: (path: string) => Promise<HostResult>
  readonly calls: readonly string[]
} {
  const calls: string[] = []
  return {
    open: async (path) => {
      calls.push(path)
      return result
    },
    calls,
  }
}

describe("openTrackedFile", () => {
  it("一覧にあるパスはホストへ1回渡し、開けたら true", async () => {
    const host = recordingOpen({ ok: true })

    expect(await openTrackedFile("docs/display.md", async () => TRACKED, host.open)).toBe(true)
    expect(host.calls).toEqual(["docs/display.md"])
  })

  it("一覧に無いパスではホストを呼ばず false", async () => {
    const host = recordingOpen({ ok: true })

    expect(await openTrackedFile("/etc/passwd", async () => TRACKED, host.open)).toBe(false)
    expect(await openTrackedFile("--help", async () => TRACKED, host.open)).toBe(false)
    expect(host.calls).toEqual([])
  })

  it("ホストが開けなかったら false", async () => {
    const host = recordingOpen({ ok: false, reason: "orca が無い" })

    expect(await openTrackedFile("src/cli.ts", async () => TRACKED, host.open)).toBe(false)
    expect(host.calls).toEqual(["src/cli.ts"])
  })
})
