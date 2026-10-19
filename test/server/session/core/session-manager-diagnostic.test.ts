import { describe, expect, it } from "vitest"

import type { SessionDriver } from "../../../../src/server/session-driver/core/session-driver.ts"
import type { DiagnosticEntry } from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import type {
  DiagnosedErrorName,
  SwallowedFailurePlace,
} from "../../../../src/shared/diagnostic/swallowed-failure.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import { launchWith } from "../../../fixture/session-manager-record.ts"
import { createSessionManager, waitForBatch } from "../../../fixture/session-manager.ts"

describe("createSessionManager", () => {
  describe("診断ログの足跡", () => {
    /** 畳んだイベントの足跡だけに絞る（このセッションは `browser-error` の流れを書かない）。 */
    function sessionEventEntries(
      entries: readonly DiagnosticEntry[],
    ): readonly (DiagnosticEntry & { readonly flow: "session-event" })[] {
      return entries.filter(
        (entry): entry is DiagnosticEntry & { readonly flow: "session-event" } =>
          entry.flow === "session-event",
      )
    }

    function swallowed(
      at: number,
      place: Extract<SwallowedFailurePlace, { feature: "session" }>["place"],
      errorName: DiagnosedErrorName = "Error",
    ): DiagnosticEntry {
      return {
        flow: "swallowed-failure",
        at,
        place: { feature: "session", place },
        errorName,
        errorCode: "none",
      }
    }

    function startDiagnosticManagerWithStub() {
      const stub = createStubDriver()
      const entries: DiagnosticEntry[] = []
      let now = 1_000
      const manager = createSessionManager({
        now: () => now,
        diagnosticLog: {
          append: (appended) => {
            entries.push(...appended)
          },
          readRange: () => [],
        },
        launchSession: launchWith(stub),
      })
      const advance = (ms: number): void => {
        now += ms
      }
      return { manager, stub, entries, advance }
    }

    it("畳んだイベントごとに、種類・時刻・駆動の代だけを書く（中身は渡さない）", async () => {
      const { stub, entries, advance } = startDiagnosticManagerWithStub()
      await waitForBatch()

      stub.emit({ kind: "request", text: "架空の依頼", images: [] })
      advance(10)
      stub.emit({ kind: "speech", text: "架空のセリフ", expression: "proud" })
      await waitForBatch()

      expect(entries).toEqual([
        { flow: "session-event", at: 1_000, generation: 1, kind: "request" },
        { flow: "session-event", at: 1_010, generation: 1, kind: "speech" },
      ])
    })

    it("起こし直したあとのイベントは次の代として書く", async () => {
      const { manager, stub, entries } = startDiagnosticManagerWithStub()
      await waitForBatch()

      stub.emit({ kind: "plan", plan: "架空のプラン" })
      await manager.commands.session.switchCharacter({ name: "fictional" })
      stub.emit({ kind: "plan", plan: "架空のプラン" })
      await waitForBatch()

      expect(sessionEventEntries(entries).map((entry) => entry.generation)).toEqual([1, 2])
    })

    it("閉じるときは間隔を待たずに積んだぶんを書く", () => {
      const { manager, stub, entries } = startDiagnosticManagerWithStub()

      stub.emit({ kind: "turn-started" })
      manager.close()

      expect(sessionEventEntries(entries).map((entry) => entry.kind)).toEqual(["turn-started"])
    })

    it("起こし直しに失敗したら、場所の名前と error.name・code の1行を書く（message は入らない）", async () => {
      const manager = createSessionManager({
        now: () => 2_000,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
        launchSession: (onEvent, _onRestoredEvents, request) => {
          if (request.selection.by === "initial") {
            const stub = createStubDriver()
            stub.attach(onEvent)
            return Promise.resolve(stub.driver)
          }
          return Promise.reject(
            Object.assign(new Error("架空の起こし直し失敗"), { name: "TypeError" }),
          )
        },
      })
      const entries: DiagnosticEntry[] = []

      await manager.commands.session.switchCharacter({ name: "fictional" })
      await waitForBatch()

      expect(entries).toEqual([swallowed(2_000, "restart", "TypeError")])
    })

    it("コンテキストの内訳・プランの内訳の問い合わせが失敗したら、それぞれ場所の名前で1行書く", async () => {
      const entries: DiagnosticEntry[] = []
      const manager = createSessionManager({
        now: () => 3_000,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
        launchSession: () => Promise.reject(new Error("架空の起動失敗")),
      })

      await manager.readContextUsage()
      await manager.readPlanUsage()
      await waitForBatch()

      expect(entries).toEqual([
        swallowed(3_000, "read-context-usage"),
        swallowed(3_000, "read-plan-usage"),
      ])
    })

    it("セッションの中身の問い合わせが失敗したら、場所の名前で1行書く", async () => {
      const entries: DiagnosticEntry[] = []
      const stub = createStubDriver()
      const failingDriver: SessionDriver = {
        ...stub.driver,
        readSessionDigest: () => Promise.reject(new Error("架空のdigest取得失敗")),
      }
      const manager = createSessionManager({
        now: () => 4_000,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
        launchSession: (onEvent) => {
          stub.attach(onEvent)
          onEvent({ kind: "sessions-changed", sessions: [], current: "fake-current" })
          return Promise.resolve(failingDriver)
        },
      })

      await manager.readSessionDigest("fake-current")
      await waitForBatch()

      // 起こすときに流した sessions-changed の足跡と、失敗の1行の2件。
      expect(entries).toEqual([
        { flow: "session-event", at: 4_000, generation: 1, kind: "sessions-changed" },
        swallowed(4_000, "read-session-digest"),
      ])
    })
  })
})
