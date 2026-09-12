import { describe, expect, it } from "bun:test"
import { createServer as createNetServer, type Server as NetServer } from "node:net"

import {
  DEFAULT_VIEW_PORT,
  resolveViewPort,
  type ResolvedViewPort,
  startOnResolvedPort,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "../../src/infrastructure/view-port.ts"
import { startViewServer, type ViewServer } from "../../src/infrastructure/view-server.ts"

/** `node:http` の `listen` が投げるエラーに似せた、`code` 付きのエラーを作る。 */
function errnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(`listen ${code}: ダミー`) as NodeJS.ErrnoException
  error.code = code
  return error
}

/** ポート1つを塞ぐダミーの TCP サーバ。`node:http` を起こす必要はない（塞げれば十分）。 */
function listenOnEphemeralPort(): Promise<NetServer> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      resolve(server)
    })
  })
}

function portOf(server: NetServer): number {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("ポート番号を取れない")
  }
  return address.port
}

function closeNetServer(server: NetServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

describe("resolveViewPort", () => {
  it("未設定・空文字は既定ポートを使う", () => {
    expect(resolveViewPort(undefined)).toEqual({ kind: "default", port: DEFAULT_VIEW_PORT })
    expect(resolveViewPort("")).toEqual({ kind: "default", port: DEFAULT_VIEW_PORT })
    expect(resolveViewPort("   ")).toEqual({ kind: "default", port: DEFAULT_VIEW_PORT })
  })

  it("数値を渡すと明示的に指定したものとして扱う（0 も含む）", () => {
    expect(resolveViewPort("8080")).toEqual({ kind: "explicit", port: 8080 })
    expect(resolveViewPort("0")).toEqual({ kind: "explicit", port: 0 })
  })

  it("ポート番号として読めない値は invalid", () => {
    expect(resolveViewPort("ぜんぶ")).toEqual({ kind: "invalid" })
    expect(resolveViewPort("-1")).toEqual({ kind: "invalid" })
    expect(resolveViewPort("70000")).toEqual({ kind: "invalid" })
    expect(resolveViewPort("1.5")).toEqual({ kind: "invalid" })
  })
})

describe("startOnResolvedPort（決定的：ダミーの start 関数）", () => {
  it("明示指定は EADDRINUSE でも一度しか試さず、そのまま失敗を返す", async () => {
    let calls = 0
    const resolution: ResolvedViewPort = { kind: "explicit", port: 12345 }

    const result = await startOnResolvedPort(resolution, (port) => {
      calls += 1
      expect(port).toBe(12345)
      return Promise.reject(errnoError("EADDRINUSE"))
    })

    expect(calls).toBe(1)
    expect(result.ok).toBe(false)
  })

  it("既定指定は EADDRINUSE のあいだ次のポートへずらし、空いた時点で成功する", async () => {
    const tried: number[] = []
    const resolution: ResolvedViewPort = { kind: "default", port: 20000 }

    const result = await startOnResolvedPort(resolution, (port) => {
      tried.push(port)
      if (tried.length < 3) {
        return Promise.reject(errnoError("EADDRINUSE"))
      }
      return Promise.resolve({ port })
    })

    expect(tried).toEqual([20000, 20001, 20002])
    expect(result).toEqual({ ok: true, server: { port: 20002 }, port: 20002 })
  })

  it("EADDRINUSE 以外（EACCES など）はずらさずその場で失敗を返す", async () => {
    let calls = 0
    const resolution: ResolvedViewPort = { kind: "default", port: 20000 }

    const result = await startOnResolvedPort(resolution, (port) => {
      calls += 1
      expect(port).toBe(20000)
      return Promise.reject(errnoError("EACCES"))
    })

    expect(calls).toBe(1)
    expect(result.ok).toBe(false)
  })

  it("上限まで全部 EADDRINUSE なら、試した範囲を含む理由付きで失敗を返す", async () => {
    let calls = 0
    const resolution: ResolvedViewPort = { kind: "default", port: 30000 }

    const result = await startOnResolvedPort(resolution, () => {
      calls += 1
      return Promise.reject(errnoError("EADDRINUSE"))
    })

    expect(calls).toBe(VIEW_PORT_FALLBACK_ATTEMPTS)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("30000")
      expect(result.reason).toContain(String(30000 + VIEW_PORT_FALLBACK_ATTEMPTS - 1))
    }
  })
})

describe("startOnResolvedPort（実際に OS のポートを塞いで確かめる）", () => {
  it("既定ポートが実際に塞がっていたら、次のポートで本物の startViewServer が listen する", async () => {
    const blocker = await listenOnEphemeralPort()
    const blockedPort = portOf(blocker)
    let started: ViewServer | undefined = undefined

    try {
      const result = await startOnResolvedPort({ kind: "default", port: blockedPort }, (port) =>
        startViewServer(
          port,
          () => false,
          () => Promise.resolve(),
          () => false,
          () => Promise.resolve(false),
          () => Promise.resolve(false),
          () => [],
          "",
        ),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        started = result.server
        expect(result.port).toBeGreaterThan(blockedPort)
        expect(started.layoutUrl).toContain(`:${String(result.port)}`)
      }
    } finally {
      await started?.close()
      await closeNetServer(blocker)
    }
  })

  it("明示指定で実際に塞がっているポートを渡すと、ずらさずに失敗する", async () => {
    const blocker = await listenOnEphemeralPort()
    const blockedPort = portOf(blocker)

    try {
      const result = await startOnResolvedPort({ kind: "explicit", port: blockedPort }, (port) =>
        startViewServer(
          port,
          () => false,
          () => Promise.resolve(),
          () => false,
          () => Promise.resolve(false),
          () => Promise.resolve(false),
          () => [],
          "",
        ),
      )

      expect(result.ok).toBe(false)
    } finally {
      await closeNetServer(blocker)
    }
  })
})
