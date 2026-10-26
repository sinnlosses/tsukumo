import { describe, expect, it } from "vitest"

import type { ContextUsageEntry } from "../../../../src/server/context-usage/core/context-usage.ts"
import type { ExperienceMetricEntry } from "../../../../src/server/experience-metric/core/experience-metric.ts"
import type { SessionDriver } from "../../../../src/server/session-driver/core/session-driver.ts"
import type { TokenUsageEntry } from "../../../../src/server/token-usage/core/token-usage.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../../src/shared/context-usage/context-usage.ts"
import type {
  ModelTokenUsage,
  ScopeUsage,
  TurnUsageBreakdown,
} from "../../../../src/shared/token-usage/token-usage.ts"
import { NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"
import { contextUsage, readyContextUsage } from "../../../fixture/context-usage.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { knownRestored } from "../../../fixture/restored-event.ts"
import { createStubDriver } from "../../../fixture/session-driver.ts"
import { CHARACTER_EVENT, requestEvent } from "../../../fixture/session-event.ts"
import { collector, launchWith, sessionInfo } from "../../../fixture/session-manager-record.ts"
import {
  createSessionManager,
  FICTIONAL_PROJECT,
  RESTORED_REPLAY,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

describe("createSessionManager", () => {
  describe("仕切りを離した記録", () => {
    function startSplitManager() {
      const stub = createStubDriver()
      const { entries, append } = collector<ExperienceMetricEntry>()
      const manager = createSessionManager({
        experienceMetricLog: { append, readRange: () => [] },
        launchSession: launchWith(stub),
      })
      return { manager, stub, entries }
    }

    const RELEASE = { divider: "rowTop", releasedPercent: 62, previousPercent: 55 } as const

    it("セッションIDが分かってから、離すたびに1行ずつ書く", async () => {
      const { manager, stub, entries } = startSplitManager()
      await waitForBatch()

      manager.recordSplit(RELEASE)
      expect(entries).toEqual([])

      stub.emit(sessionInfo("claude-session-1"))
      await waitForBatch()
      manager.recordSplit(RELEASE)
      manager.recordSplit({ ...RELEASE, divider: "topLeft" })

      expect(entries).toEqual([
        { at: 1_000, sessionId: "claude-session-1", kind: "split", ...RELEASE },
        {
          at: 1_000,
          sessionId: "claude-session-1",
          kind: "split",
          ...RELEASE,
          divider: "topLeft",
        },
      ])
    })
  })

  // トークン消費の記録。数と時刻とモデルの名前だけが
  // 記録へ渡ることを、ここで固定する。
  describe("トークン消費の記録", () => {
    const SESSION_INFO = sessionInfo("claude-session-1")

    /** 架空のステップ1つぶんの使用量。 */
    const STEP_USAGE = {
      inputTokens: 43_145,
      outputTokens: 13_371,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    }

    /** ツールもステップも無かった持ち場（数はすべて 0）。 */
    const EMPTY_SCOPE: ScopeUsage = {
      steps: 0,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      tools: [],
    }

    /** 何も積まずに終わったターンの内訳。 */
    const EMPTY_BREAKDOWN: TurnUsageBreakdown = { main: EMPTY_SCOPE, subagent: EMPTY_SCOPE }

    /** 架空の累計（実物の使用量は使わない）。 */
    function cumulative(input: number, output: number, cost: number): readonly ModelTokenUsage[] {
      return [
        {
          model: "claude-opus-fictional",
          inputTokens: input,
          outputTokens: output,
          thinkingTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: cost,
        },
      ]
    }

    function startTokenUsageManagerWithStub() {
      const stub = createStubDriver()
      const { entries, append } = collector<TokenUsageEntry>()
      const manager = createSessionManager({
        tokenUsageLog: { append, prefetchOpenTask: () => {}, readRange: () => [] },
        launchSession: launchWith(stub),
      })
      return { manager, stub, entries }
    }

    it("依頼の始まりで着手中のタスクの先読みを1回起こし、token-usage・turn-finished では起こさない", async () => {
      const stub = createStubDriver()
      const prefetched: number[] = []
      createSessionManager({
        tokenUsageLog: {
          append: () => {},
          prefetchOpenTask: (now) => prefetched.push(now),
          readRange: () => [],
        },
        launchSession: launchWith(stub),
      })
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit(requestEvent("依頼"))
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(prefetched).toEqual([1_000])
    })

    it("ターンごとに、前の累計との差を1行ぶん渡す", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      stub.emit({ kind: "token-usage", cumulative: cumulative(260, 35, 1.25) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          mode: "work",
          models: cumulative(100, 20, 0.5),
          breakdown: EMPTY_BREAKDOWN,
          speakOnlySteps: 0,
        },
        {
          at: 1_000,
          sessionId: "claude-session-1",
          mode: "work",
          models: cumulative(160, 15, 0.75),
          breakdown: EMPTY_BREAKDOWN,
          speakOnlySteps: 0,
        },
      ])
    })

    it("増えていないターンは行を渡さない", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      await waitForBatch()

      expect(entries.length).toBe(1)
    })

    it("雑談モードのターンは mode: chat になる", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "token-usage", cumulative: cumulative(10, 2, 0.01) })
      await waitForBatch()

      expect(entries.map((entry) => entry.mode)).toEqual(["chat"])
    })

    it("そのターンに使ったツールを、名前ごとに畳んで同じ行に入れる", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: { command: "架空のコマンド" },
        parentToolUseId: undefined,
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-1", content: "12345", isError: false })
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-2",
        name: "Bash",
        input: { command: "架空のコマンド" },
        parentToolUseId: undefined,
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-2", content: "123", isError: false })
      stub.emit({ kind: "step-usage", messageId: "msg-1", scope: "main", usage: STEP_USAGE })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((written) => written.breakdown.main)).toEqual([
        { steps: 1, tokens: STEP_USAGE, tools: [{ name: "Bash", calls: 2, resultBytes: 8 }] },
      ])
      expect(entries.map((written) => written.breakdown.subagent)).toEqual([EMPTY_SCOPE])
    })

    it("内訳はターンごとに0から積む（前のターンのツールを持ち越さない）", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      stub.emit(SESSION_INFO)
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: {},
        parentToolUseId: undefined,
      })
      stub.emit({ kind: "tool-finished", toolUseId: "t-1", content: "12345", isError: false })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      stub.emit({ kind: "token-usage", cumulative: cumulative(200, 40, 1) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((written) => written.breakdown.main.tools)).toEqual([
        [{ name: "Bash", calls: 1, resultBytes: 5 }],
        [],
      ])
    })

    // この検査がいちばん重要（`docs/coding-standards.md`「会話内容の扱い」）。依頼の文面・
    // セリフ・ツールの引数・ツールの結果を同じターンに流しても、記録へ渡る1行にはそのどれも
    // 現れない。
    it("依頼の文面・セリフ・ツールの引数と結果が1文字も入らない", async () => {
      const { stub, entries } = startTokenUsageManagerWithStub()
      await waitForBatch()

      const secrets = [
        "架空の依頼の文面",
        "架空のセリフ",
        "架空のツールの引数",
        "架空のツールの結果",
        "架空の本文",
      ]
      stub.emit(SESSION_INFO)
      stub.emit(requestEvent(secrets[0] ?? ""))
      stub.emit({
        kind: "tool-started",
        toolUseId: "t-1",
        name: "Bash",
        input: { command: secrets[2] },
        parentToolUseId: undefined,
      })
      stub.emit({
        kind: "tool-finished",
        toolUseId: "t-1",
        content: secrets[3] ?? "",
        isError: false,
      })
      stub.emit({ kind: "speech", text: secrets[1] ?? "", expression: "default" })
      stub.emit({ kind: "utterance", text: secrets[4] ?? "" })
      stub.emit({ kind: "token-usage", cumulative: cumulative(100, 20, 0.5) })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.length).toBe(1)
      const written = JSON.stringify(entries)
      for (const secret of secrets) {
        expect(written).not.toContain(secret)
      }
    })
  })

  // コンテキストの内訳の記録（`ContextUsageRecord`）。1行 = 1セッションで、
  // 取れなかった回は次のターンで取り直すことを、ここで固定する。
  describe("コンテキストの内訳の記録", () => {
    /**
     * 内訳の問い合わせが返す答えを差し替えて起こす。`reports` は呼ばれた順に返し、尽きたら
     * 最後のものを返し続ける（`stub.driver` の既定は常に「取れた」なので、取れない回を
     * 作るにはここで差し替える）。
     */
    function startContextUsageManagerWithStub(reports: readonly ContextUsageReport[]) {
      const stub = createStubDriver()
      const { entries, append } = collector<ContextUsageEntry>()
      let asked = 0
      const driver: SessionDriver = {
        ...stub.driver,
        readContextUsage: () => {
          const report = reports[Math.min(asked, reports.length - 1)]
          asked += 1
          return Promise.resolve(report ?? UNAVAILABLE_CONTEXT_USAGE)
        },
      }
      const manager = createSessionManager({
        contextUsageLog: { append },
        launchSession: launchWith(stub, driver),
      })
      return { manager, stub, entries, asked: () => asked }
    }

    it("1つのセッションでは、ターンを何度終えても1行だけ書く", async () => {
      const { stub, entries, asked } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([
        { at: 1_000, sessionId: "claude-session-1", mode: "work", usage: contextUsage() },
      ])
      // 書いたあとは問い合わせにも行かない。
      expect(asked()).toBe(1)
    })

    it("claude 側のセッションIDが変われば、もう1行書く", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()
      stub.emit(sessionInfo("claude-session-2"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((entry) => entry.sessionId)).toEqual([
        "claude-session-1",
        "claude-session-2",
      ])
    })

    it("内訳が取れなかったターンは書かず、次のターンで取り直す", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([
        UNAVAILABLE_CONTEXT_USAGE,
        readyContextUsage(),
      ])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([])

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((entry) => entry.sessionId)).toEqual(["claude-session-1"])
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries, asked } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries).toEqual([])
      expect(asked()).toBe(0)
    })

    it("雑談モードのセッションは mode: chat で書く", async () => {
      const { stub, entries } = startContextUsageManagerWithStub([readyContextUsage()])
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "chat-mode-changed", chat: true })
      stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
      await waitForBatch()

      expect(entries.map((entry) => entry.mode)).toEqual(["chat"])
    })
  })

  it("復元で流し直されたぶんは、仕事の report・turn-finished の結論も含めてどの記録にも書かない（新しく届いたぶんは、畳んだパックで書く）", async () => {
    const stub = createStubDriver()
    const written: { readonly log: string; readonly entry: unknown }[] = []
    const record =
      (log: string) =>
      (entry: unknown): void => {
        written.push({ log, entry })
      }
    createSessionManager({
      chatArchive: {
        ...NOOP_CHAT_ARCHIVE,
        append: (packName, entry) => record("chat")({ packName, entry }),
      },
      tokenUsageLog: {
        append: record("token"),
        prefetchOpenTask: () => {},
        readRange: () => [],
      },
      contextUsageLog: { append: record("context") },
      reportUsageLog: { append: record("report"), appendRejection: record("report-rejection") },
      diagnosticLog: { append: record("diagnostic"), readRange: () => [] },
      launchSession: (onEvent, onRestoredEvents) => {
        stub.attach(onEvent)
        stub.attachRestored(onRestoredEvents)
        return Promise.resolve(stub.driver)
      },
    })
    await waitForBatch()

    stub.emit({
      kind: "session-info",
      sessionId: "claude-session-1",
      model: "opus",
      permissionMode: "auto",
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    })
    await waitForBatch()
    const before = written.length

    stub.emitRestored(
      knownRestored([
        CHARACTER_EVENT,
        reportEvent({ toolUseId: "toolu_r1", conclusion: "前のセッションの結論" }),
        {
          kind: "token-usage",
          cumulative: [
            {
              model: "claude-opus-fictional",
              inputTokens: 100,
              outputTokens: 20,
              thinkingTokens: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
              costUsd: 0.5,
            },
          ],
        },
        {
          kind: "question-answered",
          toolUseId: "toolu_fictional",
          questions: [
            {
              header: "架空の見出し",
              text: "架空の質問文",
              multiSelect: false,
              options: [{ label: "架空の選択肢", description: "", preview: undefined }],
            },
          ],
          answers: [["架空の答え"]],
        },
        ...RESTORED_REPLAY,
      ]),
    )
    await waitForBatch()

    expect(written.slice(before)).toEqual([])

    stub.emit(requestEvent("新しい依頼"))
    await waitForBatch()

    expect(written.slice(before).filter((call) => call.log === "chat")).toEqual([
      {
        log: "chat",
        entry: {
          packName: "fictional",
          entry: {
            mode: "work",
            kind: "request",
            at: 1_000,
            text: "新しい依頼",
            project: FICTIONAL_PROJECT,
            images: undefined,
          },
        },
      },
    ])
  })
})
