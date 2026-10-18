import { describe, expect, it } from "vitest"

import type {
  ChatConsolidationOutcome,
  ChatConsolidationSource,
} from "../../../../src/server/chat/core/chat-consolidation-writer.ts"
import type { SessionManagerOptions } from "../../../../src/server/session/core/session-manager-port.ts"
import type { DiagnosticEntry } from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import type { ServerFrame } from "../../../../src/shared/frame.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { characterChangedEvent } from "../../../fixture/character.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import {
  CHARACTER_EVENT,
  createSessionManager,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

describe("createSessionManager", () => {
  describe("定着", () => {
    function startChatManagerWithStub(
      overrides: Partial<
        Pick<SessionManagerOptions, "chatArchive" | "chatConsolidation" | "diagnosticLog">
      > = {},
    ) {
      const stub = createStubDriver()
      const manager = createSessionManager({
        ...overrides,
        launchSession: (onEvent) => {
          stub.attach(onEvent)
          return Promise.resolve(stub.driver)
        },
      })
      return { manager, stub }
    }

    /**
     * 呼ばれたパック名と信号を覚え、結果はテストが手で返す書き手（本物の `query()` は起こさない）。
     */
    function createManualConsolidation() {
      const calls: { readonly packName: string; readonly signal: AbortSignal }[] = []
      const pending: ((outcome: ChatConsolidationOutcome) => void)[] = []
      const source: ChatConsolidationSource = {
        kind: "consolidate",
        consolidate: (packName, signal) => {
          calls.push({ packName, signal })
          const { promise, resolve } = Promise.withResolvers<ChatConsolidationOutcome>()
          pending.push(resolve)
          return promise
        },
      }
      const finish = (outcome: ChatConsolidationOutcome): void => {
        pending.shift()?.(outcome)
      }
      return { source, calls, finish }
    }

    /** 届いた `events` のうち `chat-topics-changed` だけ。 */
    function topicEvents(frames: readonly ServerFrame[]): readonly SessionEvent[] {
      return frames.flatMap((frame) =>
        frame.type === "events"
          ? frame.events
              .map(({ event }) => event)
              .filter((event) => event.kind === "chat-topics-changed")
          : [],
      )
    }

    const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

    function startWithDiagnostics() {
      const entries: DiagnosticEntry[] = []
      const consolidation = createManualConsolidation()
      const { stub } = startChatManagerWithStub({
        chatConsolidation: consolidation.source,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
      })
      stub.emit(CHARACTER_EVENT)
      return { stub, consolidation, entries }
    }

    async function startInChat() {
      const consolidation = createManualConsolidation()
      const started = startChatManagerWithStub({ chatConsolidation: consolidation.source })
      const frames: ServerFrame[] = []
      started.manager.subscribe((frame) => frames.push(frame))
      await waitForBatch()
      started.stub.emit(CHARACTER_EVENT)
      started.stub.emit({ kind: "chat-mode-changed", chat: true })
      return { ...started, consolidation, frames }
    }

    it("雑談のターンの終わりに1本だけ起こし、走っているあいだの契機は捨て、走り終えても次のターンの終わりまで起こさない", async () => {
      const { stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls.map((call) => call.packName)).toEqual(["fictional"])

      // 走っているあいだのターンの終わりは捨てる（待ち行列にも積まない）。
      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(1)

      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: false,
      })
      await waitForBatch()
      // 書けたら、書いたファイルから取った見出しを流す。
      expect(topicEvents(frames)).toEqual([{ kind: "chat-topics-changed", topics: ["架空の話題"] }])
      // 走り終えただけでは次を起こさない。
      expect(consolidation.calls).toHaveLength(1)

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(2)
    })

    it("失敗しても落ちずに見出しを流さず、次のターンの終わりに拾い直す。閉じたら走っている1本を中断する", async () => {
      const { manager, stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "failed", reason: "aborted" })
      await waitForBatch()
      expect(topicEvents(frames)).toEqual([])

      stub.emit(TURN_FINISHED)
      expect(consolidation.calls).toHaveLength(2)
      expect(consolidation.calls[1]?.signal.aborted).toBe(false)

      manager.close()
      expect(consolidation.calls[1]?.signal.aborted).toBe(true)
    })

    it("失敗は、理由の語と error.name・code の1行を診断ログへ書く（message は入らない）", async () => {
      const { stub, consolidation, entries } = startWithDiagnostics()

      stub.emit(TURN_FINISHED)
      consolidation.finish({
        kind: "failed",
        reason: "threw",
        error: Object.assign(new Error("架空の失敗文"), { name: "TypeError", code: "EACCES" }),
      })
      await waitForBatch()
      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "failed", reason: "summary-write" })
      await waitForBatch()

      expect(entries.filter((entry) => entry.flow === "swallowed-failure")).toEqual([
        {
          flow: "swallowed-failure",
          at: 1_000,
          place: { feature: "chat", place: "consolidation-threw" },
          errorName: "TypeError",
          errorCode: "EACCES",
        },
        {
          flow: "swallowed-failure",
          at: 1_000,
          place: { feature: "chat", place: "consolidation-summary-write" },
          errorName: "other",
          errorCode: "none",
        },
      ])
      expect(JSON.stringify(entries)).not.toContain("架空の失敗文")
    })

    it("あらすじの古い行を落として書けたときだけ、落とした行数を診断ログへ書く", async () => {
      const { stub, consolidation, entries } = startWithDiagnostics()

      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "written", topics: [], droppedLines: 0, shrinkWaived: false })
      await waitForBatch()
      stub.emit(TURN_FINISHED)
      consolidation.finish({ kind: "written", topics: [], droppedLines: 3, shrinkWaived: false })
      await waitForBatch()

      expect(entries.filter((entry) => entry.flow === "synopsis-trim")).toEqual([
        { flow: "synopsis-trim", at: 1_000, droppedLines: 3 },
      ])
    })

    it("検査に落ちた理由と、縮みの検査を外して書いたことを、場所の語で診断ログへ書く（本文は入らない）", async () => {
      const { stub, consolidation, entries } = startWithDiagnostics()

      const rejections = [
        "shape",
        "synopsis-empty",
        "synopsis-too-long",
        "synopsis-reserved-tag",
        "synopsis-shrunk",
      ] as const
      for (const rejection of rejections) {
        stub.emit(TURN_FINISHED)
        consolidation.finish({ kind: "failed", reason: "unreadable-result", rejection })
        await waitForBatch()
      }
      stub.emit(TURN_FINISHED)
      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: true,
      })
      await waitForBatch()

      expect(
        entries
          .filter((entry) => entry.flow === "swallowed-failure")
          .map((entry) => entry.place.place),
      ).toEqual([
        "consolidation-unreadable-result",
        "consolidation-synopsis-empty",
        "consolidation-synopsis-too-long",
        "consolidation-synopsis-reserved-tag",
        "consolidation-synopsis-shrunk",
        "consolidation-synopsis-shrink-waived",
      ])
      expect(JSON.stringify(entries)).not.toContain("架空の話題")
    })

    it("定着の口が拒否しても、失敗として記録して次のターンの終わりでまた起こす", async () => {
      const entries: DiagnosticEntry[] = []
      const calls: string[] = []
      const source: ChatConsolidationSource = {
        kind: "consolidate",
        consolidate: (packName) => {
          calls.push(packName)
          return Promise.reject(new TypeError("架空の失敗文"))
        },
      }
      const { stub } = startChatManagerWithStub({
        chatConsolidation: source,
        diagnosticLog: {
          append: (appended) => entries.push(...appended),
          readRange: () => [],
        },
      })
      stub.emit(CHARACTER_EVENT)

      stub.emit(TURN_FINISHED)
      await waitForBatch()
      stub.emit(TURN_FINISHED)
      await waitForBatch()

      expect(calls).toEqual(["fictional", "fictional"])
      expect(entries.filter((entry) => entry.flow === "swallowed-failure")).toMatchObject([
        { place: { feature: "chat", place: "consolidation-threw" }, errorName: "TypeError" },
        { place: { feature: "chat", place: "consolidation-threw" }, errorName: "TypeError" },
      ])
      expect(JSON.stringify(entries)).not.toContain("架空の失敗文")
    })

    it("書けた時点で別のパックに替わっていれば、見出しを流さない", async () => {
      const { stub, consolidation, frames } = await startInChat()

      stub.emit(TURN_FINISHED)
      stub.emit(characterChangedEvent({ pack: "another-fictional" }))
      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: false,
      })
      await waitForBatch()

      expect(topicEvents(frames)).toEqual([])
    })

    it("仕事のターンの終わりにも起こし、書けても話題の見出しは流さない", async () => {
      const consolidation = createManualConsolidation()
      const { manager, stub } = startChatManagerWithStub({
        chatConsolidation: consolidation.source,
      })
      const frames: ServerFrame[] = []
      manager.subscribe((frame) => frames.push(frame))
      await waitForBatch()
      stub.emit(CHARACTER_EVENT)
      stub.emit(TURN_FINISHED)

      expect(consolidation.calls.map((call) => call.packName)).toEqual(["fictional"])

      consolidation.finish({
        kind: "written",
        topics: ["架空の話題"],
        droppedLines: 0,
        shrinkWaived: false,
      })
      await waitForBatch()

      expect(topicEvents(frames)).toEqual([])
    })
  })
})
