import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import {
  forgetReply,
  rememberReply,
} from "../../../../src/server/session-driver/core/persona-memory-reply.ts"
import type {
  PersonaForgetResult,
  PersonaMemory,
  PersonaRememberResult,
  SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { fixedChatSummary } from "../../../fixture/chat.ts"
import { callTool } from "../../../fixture/mcp-server.ts"
import { CHAT_MODE, EXPRESSIONS, FAKE_CWD, NOT_FOUND_RECALL } from "../../../fixture/sdk-tool.ts"

describe("remember / forget ツール", () => {
  /** 渡す行（手で書いた架空のもの）。応答に混ざらないことを確かめる目印にもする。 */
  const SENT_LINE = "架空の目印つきの一行ZQX"

  function memoryServer(
    memory: PersonaMemory,
    allowsRemember: () => boolean,
  ): () => McpSdkServerConfigWithInstance {
    return () =>
      tsukumoServer(
        EXPRESSIONS,
        {
          kind: "chat",
          personaMemory: memory,
          chatSummary: fixedChatSummary(undefined),
          chatRecall: NOT_FOUND_RECALL,
        },
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
        allowsRemember,
      )
  }

  function memoryReturning(
    remember: PersonaRememberResult,
    forget: PersonaForgetResult,
    rememberedLines: string[] = [],
  ): PersonaMemory {
    return {
      remember: (line) => {
        rememberedLines.push(line)
        return remember
      },
      forget: () => forget,
      finishTurn: () => {},
    }
  }

  it("書けた・消せたときは ok だけを返す", async () => {
    const server = memoryServer(memoryReturning("written", "erased"), () => true)

    expect(await callTool(server(), "remember", { line: SENT_LINE })).toEqual({
      text: "ok",
      isError: false,
      endsTurn: false,
    })
    expect(await callTool(server(), "forget", { line: SENT_LINE })).toEqual({
      text: "ok",
      isError: false,
      endsTurn: false,
    })
  })

  it("外部由来の印が立っていれば口を呼ばず、固定文を isError で返す", async () => {
    const called: string[] = []
    const reply = await callTool(
      memoryServer(memoryReturning("written", "erased", called), () => false)(),
      "remember",
      { line: SENT_LINE },
    )

    expect(called).toEqual([])
    expect(reply).toEqual({ ...rememberReply("external-tool"), endsTurn: false })
    expect(reply.isError).toBe(true)
  })

  it.each(["turn-used", "unwritable-line", "duplicate", "not-editable", "failed"] as const)(
    "remember が %s なら、その固定文を isError で返す",
    async (result) => {
      const reply = await callTool(
        memoryServer(memoryReturning(result, "erased"), () => true)(),
        "remember",
        { line: SENT_LINE },
      )

      expect(reply).toEqual({ ...rememberReply(result), endsTurn: false })
      expect(reply.isError).toBe(true)
    },
  )

  it.each(["turn-used", "no-match", "not-editable", "failed"] as const)(
    "forget が %s なら、その固定文を isError で返す（印には掛からない）",
    async (result) => {
      const reply = await callTool(
        memoryServer(memoryReturning("written", result), () => false)(),
        "forget",
        { line: SENT_LINE },
      )

      expect(reply).toEqual({ ...forgetReply(result), endsTurn: false })
      expect(reply.isError).toBe(true)
    },
  )

  it("印が立っていても forget は口を呼んで消せる", async () => {
    const reply = await callTool(
      memoryServer(memoryReturning("written", "erased"), () => false)(),
      "forget",
      { line: SENT_LINE },
    )

    expect(reply.text).toBe("ok")
  })

  it("どの応答の文にも渡した行が含まれない", async () => {
    const rememberResults = [
      "written",
      "turn-used",
      "unwritable-line",
      "duplicate",
      "not-editable",
      "failed",
    ] as const
    const forgetResults = ["erased", "turn-used", "no-match", "not-editable", "failed"] as const
    const texts = [
      ...(await Promise.all(
        rememberResults.map(async (result) => {
          const reply = await callTool(
            memoryServer(memoryReturning(result, "erased"), () => true)(),
            "remember",
            { line: SENT_LINE },
          )
          return reply.text
        }),
      )),
      (
        await callTool(
          memoryServer(memoryReturning("written", "erased"), () => false)(),
          "remember",
          { line: SENT_LINE },
        )
      ).text,
      ...(await Promise.all(
        forgetResults.map(async (result) => {
          const reply = await callTool(
            memoryServer(memoryReturning("written", result), () => true)(),
            "forget",
            { line: SENT_LINE },
          )
          return reply.text
        }),
      )),
    ]

    expect(texts).toHaveLength(rememberResults.length + 1 + forgetResults.length)
    expect(texts.filter((text) => text.includes("ZQX"))).toEqual([])
  })
})

describe("recall / recall_episode ツール", () => {
  it("recall は一覧の文面を、recall_episode は開いた1件の文面を返す（口が返したものをそのまま渡す）", async () => {
    const chatMode: SessionMode = {
      ...CHAT_MODE,
      chatRecall: {
        recallList: (keyword) => ({
          kind: "found",
          candidates: [{ id: `id-for-${keyword}`, title: "架空の見出し", gist: "架空の要旨" }],
        }),
        recallEpisode: (id) => ({
          kind: "found",
          entries: [
            {
              kind: "request",
              origin: { mode: "chat" },
              text: `${id} の架空のやり取り`,
              date: "2026-09-25",
            },
          ],
          overflowed: false,
        }),
        finishTurn: () => {},
      },
    }
    // `McpSdkServerConfigWithInstance` は同時に1本の transport しか繋げないので、
    // 呼び出しごとにサーバを作り直す（`callTool` が繋いで閉じる。他のテストと同じ手）。
    const server = (): McpSdkServerConfigWithInstance =>
      tsukumoServer(
        EXPRESSIONS,
        chatMode,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
        () => true,
      )

    const listReply = await callTool(server(), "recall", { keyword: "散歩" })
    const episodeReply = await callTool(server(), "recall_episode", { id: "2026-09-25-1" })

    expect(listReply.text).toContain("id-for-散歩")
    expect(listReply.text).toContain("架空の見出し")
    expect(episodeReply.text).toContain("2026-09-25-1 の架空のやり取り")
  })

  it("仕事のときも recall / recall_episode が引け、仕事の行が印つきで返る", async () => {
    const workMode: SessionMode = {
      kind: "work",
      chatRecall: {
        recallList: () => ({ kind: "not-found" }),
        recallEpisode: (id) => ({
          kind: "found",
          entries: [
            {
              kind: "conclusion",
              origin: { mode: "work", project: "架空プロジェクト" },
              text: `${id} の架空の結論`,
              date: "2026-09-25",
            },
          ],
          overflowed: false,
        }),
        finishTurn: () => {},
      },
    }

    const reply = await callTool(
      tsukumoServer(
        EXPRESSIONS,
        workMode,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
        () => true,
      ),
      "recall_episode",
      { id: "2026-09-25-1" },
    )

    expect(reply.text).toContain("[仕事: 架空プロジェクト] したこと: 2026-09-25-1 の架空の結論")
  })

  it("当たらない・知らない id のときは短い一言だけで、会話の文面は入らない", async () => {
    const chatMode: SessionMode = {
      ...CHAT_MODE,
      chatRecall: {
        recallList: () => ({ kind: "not-found" }),
        recallEpisode: () => ({ kind: "not-found" }),
        finishTurn: () => {},
      },
    }
    const server = (): McpSdkServerConfigWithInstance =>
      tsukumoServer(
        EXPRESSIONS,
        chatMode,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
        () => true,
      )

    const listReply = await callTool(server(), "recall", { keyword: "架空" })
    const episodeReply = await callTool(server(), "recall_episode", { id: "no-such-id" })

    expect(listReply.text).not.toContain("利用者:")
    expect(episodeReply.text).not.toContain("利用者:")
  })
})
