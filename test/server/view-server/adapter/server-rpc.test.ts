import { createORPCClient, ORPCError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { afterEach, describe, expect, it } from "vitest"

import type { RpcRouterPorts } from "../../../../src/router.ts"
import type { ViewServer } from "../../../../src/server/view-server/adapter/server.ts"
import type { AchievementCalendar } from "../../../../src/shared/achievement/achievement-calendar.ts"
import type {
  AchievementDaySelection,
  DailyAchievement,
} from "../../../../src/shared/achievement/achievement.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../../../src/shared/context-usage/context-usage.ts"
import { RPC_PATH, type RpcClient } from "../../../../src/shared/rpc.ts"
import {
  EMPTY_TOKEN_USAGE_SUMMARY,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../../src/shared/token-usage/token-usage-summary.ts"
import { readyContextUsage } from "../../../fixture/context-usage.ts"
import {
  closeRunningView,
  noCharacterAsset,
  noPromptImage,
  startView,
  TOKEN,
  viewOrigin,
} from "../../../fixture/view-server.ts"

afterEach(closeRunningView)

/** 手続きの口だけを差し替えて起こす。 */
function startViewWithRpc(rpcPorts: Partial<RpcRouterPorts>): Promise<ViewServer> {
  return startView(noCharacterAsset, noPromptImage, rpcPorts)
}

/** ブラウザと同じ型付きの client（起動トークンを `?t=` に載せる。無ければ付けない）。 */
function rpcClientOf(server: ViewServer, token: string | undefined): RpcClient {
  const url = new URL(`${viewOrigin(server)}${RPC_PATH}`)
  if (token !== undefined) {
    url.searchParams.set("t", token)
  }
  return createORPCClient(new RPCLink({ url: url.toString() }))
}

/** 手続きを生の `POST` で呼ぶ（client が送らない形・ヘッダを確かめるため）。 */
function postRpc(
  server: ViewServer,
  procedurePath: string,
  init: { readonly body?: string; readonly origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (init.origin !== undefined) {
    headers["origin"] = init.origin
  }
  return fetch(`${viewOrigin(server)}${RPC_PATH}/${procedurePath}?t=${TOKEN}`, {
    method: "POST",
    headers,
    body: init.body ?? "{}",
  })
}

/** 手続きの呼び出しが投げた契約のエラーの `code` と `status`（投げなければ `undefined`）。 */
async function rpcErrorOf(
  call: Promise<unknown>,
): Promise<{ readonly code: string; readonly status: number } | undefined> {
  try {
    await call
    return undefined
  } catch (error) {
    return error instanceof ORPCError ? { code: error.code, status: error.status } : undefined
  }
}

describe("startViewServer", () => {
  describe("/rpc（読み取りの手続き）", () => {
    it("repository.listFiles は、候補のパスを並びで返す。一覧を作れなかった回は空", async () => {
      const found = await startViewWithRpc({
        listRepositoryFiles: () =>
          Promise.resolve({ paths: ["src/cli.ts", "docs/architecture.md"], omittedCount: 3 }),
      })
      expect(await rpcClientOf(found, TOKEN).repository.listFiles()).toEqual({
        paths: ["src/cli.ts", "docs/architecture.md"],
        omittedCount: 3,
      })
      await found.close()

      const failed = await startViewWithRpc({
        listRepositoryFiles: () => Promise.reject(new Error("架空の失敗")),
      })
      expect(await rpcClientOf(failed, TOKEN).repository.listFiles()).toEqual({
        paths: [],
        omittedCount: 0,
      })
    })

    it("repository.fileExcerpt は、行の範囲を口へ渡して抜き書きを返す。口が失敗した回は unreadable", async () => {
      const requests: unknown[] = []
      const lines = {
        kind: "lines",
        lines: [{ number: 12, text: "架空の行", truncated: false }],
      } as const
      const found = await startViewWithRpc({
        readFileExcerpt: (request) => {
          requests.push(request)
          return Promise.resolve(lines)
        },
      })
      const request = { path: "src/cli.ts", startLine: 12, endLine: 12 }
      expect(await rpcClientOf(found, TOKEN).repository.fileExcerpt(request)).toEqual(lines)
      expect(requests).toEqual([request])
      // 終わりが頭より前の範囲は、口へ渡す前に契約が断る。
      await expect(
        rpcClientOf(found, TOKEN).repository.fileExcerpt({ ...request, endLine: 11 }),
      ).rejects.toThrow("Input validation failed")
      expect(requests).toHaveLength(1)
      await found.close()

      const failed = await startViewWithRpc({
        readFileExcerpt: () => Promise.reject(new Error("架空の失敗")),
      })
      expect(await rpcClientOf(failed, TOKEN).repository.fileExcerpt(request)).toEqual({
        kind: "unavailable",
        reason: "unreadable",
      })
      await failed.close()
    })

    it("repository.projectName は、渡された名前を返す", async () => {
      const found = await startViewWithRpc({ projectName: () => "fictional-project" })
      expect(await rpcClientOf(found, TOKEN).repository.projectName()).toBe("fictional-project")
    })

    it("tokenUsage.summary は、日数をそのまま畳む側へ渡し、集計を返す", async () => {
      const summary = {
        trend: {
          unit: "day",
          points: [
            {
              key: "2026-09-21",
              totals: {
                inputTokens: 12,
                outputTokens: 34,
                thinkingTokens: 5,
                cacheReadInputTokens: 6,
                cacheCreationInputTokens: 7,
                costUsd: 0.5,
              },
            },
          ],
        },
        byModel: [],
        byTool: [{ name: "Bash", calls: 3, resultBytes: 800 }],
      } satisfies TokenUsageSummary
      const asked: TokenUsageDays[] = []
      const server = await startViewWithRpc({
        readTokenUsageSummary: (days) => {
          asked.push(days)
          return summary
        },
      })

      expect(await rpcClientOf(server, TOKEN).tokenUsage.summary({ days: 30 })).toEqual(summary)
      expect(asked).toEqual([30])
    })

    it("tokenUsage.summary は、選べない日数を 400 で断る（畳む側へ渡さない）", async () => {
      let asked = 0
      const server = await startViewWithRpc({
        readTokenUsageSummary: () => {
          asked += 1
          return EMPTY_TOKEN_USAGE_SUMMARY
        },
      })

      const response = await postRpc(server, "tokenUsage/summary", {
        body: JSON.stringify({ json: { days: 999 } }),
      })

      expect(response.status).toBe(400)
      expect(asked).toBe(0)
    })

    it("contextUsage.report は、内訳を返す。問い合わせが失敗した回は「取れない」", async () => {
      const report = readyContextUsage()
      const ready = await startViewWithRpc({ readContextUsage: () => Promise.resolve(report) })
      expect(await rpcClientOf(ready, TOKEN).contextUsage.report()).toEqual(report)
      await ready.close()

      const failed = await startViewWithRpc({
        readContextUsage: () => Promise.reject(new Error("架空の失敗")),
      })
      expect(await rpcClientOf(failed, TOKEN).contextUsage.report()).toEqual(
        UNAVAILABLE_CONTEXT_USAGE,
      )
    })

    it("achievement.day は、見る日の選び方をそのまま読み取り側へ渡し、成果を返す", async () => {
      const achievement: DailyAchievement = {
        kind: "known",
        date: "2026-09-23",
        today: "2026-09-24",
        doneTasks: [{ id: "T-1", summary: "架空のタスク" }],
        graduations: [],
        milestones: [],
        diary: { kind: "none" },
      }
      const asked: AchievementDaySelection[] = []
      const server = await startViewWithRpc({
        readAchievementDay: (selection) => {
          asked.push(selection)
          return Promise.resolve({ kind: "ok", achievement })
        },
      })
      const client = rpcClientOf(server, TOKEN)

      expect(await client.achievement.day({ kind: "chosen", date: "2026-09-20" })).toEqual(
        achievement,
      )
      await client.achievement.day({ kind: "today" })

      expect(asked).toEqual([{ kind: "chosen", date: "2026-09-20" }, { kind: "today" }])
    })

    it("achievement.calendar は、暦を返す", async () => {
      const calendar: AchievementCalendar = {
        kind: "known",
        today: "2026-09-25",
        days: [{ date: "2026-09-25", count: 3 }],
        diaryDates: [],
      }
      const server = await startViewWithRpc({
        readAchievementCalendar: () => Promise.resolve({ kind: "ok", calendar }),
      })

      expect(await rpcClientOf(server, TOKEN).achievement.calendar()).toEqual(calendar)
    })

    it("achievement は、bd の呼び出しが一時的に失敗したときは 503 の UNAVAILABLE（部分的な数を出さない）", async () => {
      const server = await startViewWithRpc({
        readAchievementDay: () => Promise.resolve({ kind: "unavailable" }),
        readAchievementCalendar: () => Promise.reject(new Error("架空の失敗")),
      })
      const client = rpcClientOf(server, TOKEN)

      expect(await rpcErrorOf(client.achievement.day({ kind: "today" }))).toEqual({
        code: "UNAVAILABLE",
        status: 503,
      })
      expect(await rpcErrorOf(client.achievement.calendar())).toEqual({
        code: "UNAVAILABLE",
        status: 503,
      })
    })

    it("トークンが無い・違うときは 403 で、どの手続きの口も呼ばない", async () => {
      let asked = 0
      const count = <T>(value: T): T => {
        asked += 1
        return value
      }
      const server = await startViewWithRpc({
        listRepositoryFiles: () => count(Promise.resolve({ paths: [], omittedCount: 0 })),
        readTokenUsageSummary: () => count(EMPTY_TOKEN_USAGE_SUMMARY),
        readContextUsage: () => count(Promise.resolve(UNAVAILABLE_CONTEXT_USAGE)),
        readAchievementDay: () =>
          count(Promise.resolve({ kind: "ok", achievement: { kind: "unknown" } })),
        readAchievementCalendar: () =>
          count(Promise.resolve({ kind: "ok", calendar: { kind: "unknown" } })),
      })

      for (const token of [undefined, "ちがう"]) {
        const client = rpcClientOf(server, token)
        const forbidden = { code: "FORBIDDEN", status: 403 }
        expect(await rpcErrorOf(client.repository.listFiles())).toEqual(forbidden)
        expect(await rpcErrorOf(client.repository.projectName())).toEqual(forbidden)
        expect(await rpcErrorOf(client.tokenUsage.summary({ days: 7 }))).toEqual(forbidden)
        expect(await rpcErrorOf(client.contextUsage.report())).toEqual(forbidden)
        expect(await rpcErrorOf(client.achievement.day({ kind: "today" }))).toEqual(forbidden)
        expect(await rpcErrorOf(client.achievement.calendar())).toEqual(forbidden)
      }
      expect(asked).toBe(0)
    })

    it("Origin があるときは自分のオリジンと一致しなければ 403（無ければ通す）", async () => {
      let asked = 0
      const server = await startViewWithRpc({
        listRepositoryFiles: () => {
          asked += 1
          return Promise.resolve({ paths: [], omittedCount: 0 })
        },
      })

      const foreign = await postRpc(server, "repository/listFiles", {
        origin: "http://example.invalid",
      })
      const own = await postRpc(server, "repository/listFiles", { origin: viewOrigin(server) })
      const none = await postRpc(server, "repository/listFiles")

      expect(foreign.status).toBe(403)
      expect(own.status).toBe(200)
      expect(none.status).toBe(200)
      expect(asked).toBe(2)
    })

    it("知らない手続きは 404", async () => {
      const server = await startView()

      expect((await postRpc(server, "repository/unknown")).status).toBe(404)
    })

    it("本文が上限を超えた要求は手続きへ渡さずに断る", async () => {
      let asked = 0
      const server = await startViewWithRpc({
        readTokenUsageSummary: () => {
          asked += 1
          return EMPTY_TOKEN_USAGE_SUMMARY
        },
      })

      const response = await postRpc(server, "tokenUsage/summary", {
        body: JSON.stringify({ json: { days: 7, padding: "x".repeat(128 * 1024) } }),
      })

      expect(response.status).toBe(413)
      expect(asked).toBe(0)
    })
  })
})
