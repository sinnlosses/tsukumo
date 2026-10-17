import { describe, expect, it } from "vitest"

import type { ContextUsageEntry } from "../../../../src/server/context-usage/core/context-usage.ts"
import type {
  ReportRejectionEntry,
  ReportUsageEntry,
} from "../../../../src/server/report/core/report-usage.ts"
import type { QuestionUsageEntry } from "../../../../src/server/session-driver/core/question-usage.ts"
import type { SessionDriver } from "../../../../src/server/session-driver/core/session-driver.ts"
import type { TokenUsageEntry } from "../../../../src/server/token-usage/core/token-usage.ts"
import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../../src/shared/context-usage/context-usage.ts"
import type { DiagnosticEntry } from "../../../../src/shared/diagnostic/diagnostic-record.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
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
import {
  CHARACTER_EVENT,
  createSessionManager,
  FICTIONAL_PROJECT,
  RESTORED_REPLAY,
  waitForBatch,
} from "../../../fixture/session-manager.ts"

describe("createSessionManager", () => {
  // トークン消費の記録。数と時刻とモデルの名前だけが
  // 記録へ渡ることを、ここで固定する。
  describe("トークン消費の記録", () => {
    const SESSION_INFO: SessionEvent = {
      kind: "session-info",
      sessionId: "claude-session-1",
      model: "opus",
      permissionMode: "auto",
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    }

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
      const entries: TokenUsageEntry[] = []
      const manager = createSessionManager({
        tokenUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
          readRange: () => [],
        },
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
      })
      return { manager, stub, entries }
    }

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
        },
        {
          at: 1_000,
          sessionId: "claude-session-1",
          mode: "work",
          models: cumulative(160, 15, 0.75),
          breakdown: EMPTY_BREAKDOWN,
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
      stub.emit({ kind: "request", text: secrets[0] ?? "", images: [] })
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
    function sessionInfo(sessionId: string): SessionEvent {
      return {
        kind: "session-info",
        sessionId,
        model: "opus",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      }
    }

    /**
     * 内訳の問い合わせが返す答えを差し替えて起こす。`reports` は呼ばれた順に返し、尽きたら
     * 最後のものを返し続ける（`stub.driver` の既定は常に「取れた」なので、取れない回を
     * 作るにはここで差し替える）。
     */
    function startContextUsageManagerWithStub(reports: readonly ContextUsageReport[]) {
      const stub = createStubDriver()
      const entries: ContextUsageEntry[] = []
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
        contextUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
        },
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(driver)
        },
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

  // `report` の塊の使われ方の記録。描いた（差し戻されなかった）report だけが1行になることを
  // ここで固定する（docs/research/report-block.md「回し方（数えて足す・外す）」）。
  describe("report の塊の使われ方の記録", () => {
    function sessionInfo(sessionId: string): SessionEvent {
      return {
        kind: "session-info",
        sessionId,
        model: "opus",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      }
    }

    /** 描いた `report` の `SessionEvent`（中身はすべて手で書いた架空のもの）。 */
    function reportWithSections(
      sections: readonly ReportSection[],
      unknownBlockCount = 0,
    ): SessionEvent {
      return reportEvent({
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        sections,
        unknownBlockCount,
      })
    }

    function startReportUsageManagerWithStub() {
      const stub = createStubDriver()
      const entries: ReportUsageEntry[] = []
      const rejections: ReportRejectionEntry[] = []
      const manager = createSessionManager({
        reportUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
          appendRejection: (entry) => {
            rejections.push(entry)
          },
        },
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
      })
      return { manager, stub, entries, rejections }
    }

    it("描いた report のたびに、塊の種類と時刻・セッションIDを1行書く", async () => {
      const { stub, entries } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit(
        reportWithSections([
          { heading: "", blocks: [{ kind: "text", text: "架空の根拠。", fold: "", aside: "" }] },
        ]),
      )
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          figure: { figureKind: "none", noneReason: "unrecorded" },
          blockKinds: ["text"],
          blockFields: [],
          notations: [],
          containedNotations: [],
          escapeNotations: [],
          unknownBlockCount: 0,
          hasModifiedFiles: false,
          hasBeforeAfterOrImage: false,
          forTask: false,
          hasFigure: false,
          readImageWithoutImageBlock: false,
          emphasisCount: 0,
          graphEdgeCount: 0,
          graphUnlabeledEdgeCount: 0,
          graphNodeCount: 0,
          hasUnverifiedCheck: false,
          hasHowToVerify: false,
          taskGenre: "none",
          taskOutcome: "none",
          hasFavor: false,
          hasSourceReference: false,
          shortTable: false,
          sessionSummary: undefined,
        },
      ])
    })

    describe("画像を読んだのに image が無い回", () => {
      const textOnly = (): SessionEvent =>
        reportWithSections([
          { heading: "", blocks: [{ kind: "text", text: "架空の根拠。", fold: "", aside: "" }] },
        ])
      const readStarted = (parentToolUseId: string | undefined): SessionEvent => ({
        kind: "tool-started",
        toolUseId: "toolu_read",
        name: "Read",
        input: { file_path: "/tmp/fictional.png" },
        parentToolUseId,
      })

      it("メインが画像を Read したターンの report は真で、turn-finished のあとのターンは偽に戻る", async () => {
        const { stub, entries } = startReportUsageManagerWithStub()
        await waitForBatch()

        stub.emit(sessionInfo("claude-session-1"))
        stub.emit(readStarted(undefined))
        stub.emit(textOnly())
        stub.emit({ kind: "turn-finished", outcome: { kind: "completed" } })
        stub.emit(textOnly())
        await waitForBatch()

        expect(entries.map((entry) => entry.readImageWithoutImageBlock)).toEqual([true, false])
      })

      it("サブエージェントの Read は数えない", async () => {
        const { stub, entries } = startReportUsageManagerWithStub()
        await waitForBatch()

        stub.emit(sessionInfo("claude-session-1"))
        stub.emit(readStarted("toolu_parent"))
        stub.emit(textOnly())
        await waitForBatch()

        expect(entries.map((entry) => entry.readImageWithoutImageBlock)).toEqual([false])
      })
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries, rejections } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(reportWithSections([]))
      stub.emit({ kind: "report-rejected", reasons: ["resend"] })
      await waitForBatch()

      expect(entries).toEqual([])
      expect(rejections).toEqual([])
    })

    it("差し戻した report は、種類の名前と時刻・セッションIDだけを差し戻しの行として書く", async () => {
      const { stub, entries, rejections } = startReportUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit({ kind: "report-rejected", reasons: ["resend", "long-paragraph"] })
      await waitForBatch()

      expect(rejections).toEqual([
        { at: 1_000, sessionId: "claude-session-1", reasons: ["resend", "long-paragraph"] },
      ])
      expect(entries).toEqual([])
    })
  })

  // 質問（AskUserQuestion）の使われ方の記録。答えが確定した質問ごとに1行、選択肢の数と
  // preview の付いた数だけを書く（会話の文面は入らない）。
  describe("質問の使われ方の記録", () => {
    function sessionInfo(sessionId: string): SessionEvent {
      return {
        kind: "session-info",
        sessionId,
        model: "opus",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      }
    }

    /** 答えが確定した質問の `SessionEvent`（中身はすべて手で書いた架空のもの）。 */
    function questionAnsweredEvent(
      questions: readonly Question[],
      briefed: readonly boolean[] = questions.map(() => false),
      sentBack = 0,
    ): SessionEvent {
      return {
        kind: "question-answered",
        toolUseId: "toolu_fictional",
        questions,
        answers: questions.map(() => ["架空の答え"]),
        briefed,
        sentBack,
      }
    }

    function question(optionCount: number, previewCount: number): Question {
      return {
        header: "架空の見出し",
        text: "架空の質問文",
        multiSelect: false,
        options: Array.from({ length: optionCount }, (_, index) => ({
          label: `架空の選択肢${index}`,
          description: "",
          preview: index < previewCount ? "架空のpreview" : undefined,
        })),
      }
    }

    function startQuestionUsageManagerWithStub() {
      const stub = createStubDriver()
      const entries: QuestionUsageEntry[] = []
      const manager = createSessionManager({
        questionUsageLog: {
          append: (entry) => {
            entries.push(entry)
          },
        },
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
      })
      return { manager, stub, entries }
    }

    it("答えが確定した質問ごとに、選択肢の数・preview の付いた数・添え書きの有無・断った回数を1行書く", async () => {
      const { stub, entries } = startQuestionUsageManagerWithStub()
      await waitForBatch()

      stub.emit(sessionInfo("claude-session-1"))
      stub.emit(questionAnsweredEvent([question(3, 1), question(2, 0)], [true, false], 2))
      await waitForBatch()

      expect(entries).toEqual([
        {
          at: 1_000,
          sessionId: "claude-session-1",
          optionCount: 3,
          previewCount: 1,
          briefed: true,
          sentBack: 2,
        },
        {
          at: 1_000,
          sessionId: "claude-session-1",
          optionCount: 2,
          previewCount: 0,
          briefed: false,
          sentBack: 0,
        },
      ])
    })

    it("claude 側のセッションIDが分からないうちは書かない", async () => {
      const { stub, entries } = startQuestionUsageManagerWithStub()
      await waitForBatch()

      stub.emit(questionAnsweredEvent([question(2, 0)]))
      await waitForBatch()

      expect(entries).toEqual([])
    })
  })

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
        launchSession: (onEvent, onRestoredEvents) => {
          stub.attach(onEvent)
          stub.attachRestored(onRestoredEvents)
          return Promise.resolve(stub.driver)
        },
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

      expect(entries).toEqual([
        {
          flow: "swallowed-failure",
          at: 2_000,
          place: { feature: "session", place: "restart" },
          errorName: "TypeError",
          errorCode: "none",
        },
      ])
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
        {
          flow: "swallowed-failure",
          at: 3_000,
          place: { feature: "session", place: "read-context-usage" },
          errorName: "Error",
          errorCode: "none",
        },
        {
          flow: "swallowed-failure",
          at: 3_000,
          place: { feature: "session", place: "read-plan-usage" },
          errorName: "Error",
          errorCode: "none",
        },
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
        {
          flow: "swallowed-failure",
          at: 4_000,
          place: { feature: "session", place: "read-session-digest" },
          errorName: "Error",
          errorCode: "none",
        },
      ])
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
      tokenUsageLog: { append: record("token"), readRange: () => [] },
      contextUsageLog: { append: record("context") },
      reportUsageLog: { append: record("report"), appendRejection: record("report-rejection") },
      questionUsageLog: { append: record("question") },
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
          briefed: [false],
          sentBack: 0,
        },
        ...RESTORED_REPLAY,
      ]),
    )
    await waitForBatch()

    expect(written.slice(before)).toEqual([])

    stub.emit({ kind: "request", text: "新しい依頼", images: [] })
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
