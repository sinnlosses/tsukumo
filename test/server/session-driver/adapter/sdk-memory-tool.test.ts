import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import type {
  PersonaForgetResult,
  PersonaMemory,
  PersonaRememberResult,
} from "../../../../src/server/chat/core/chat-memory.ts"
import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import {
  forgetReply,
  rememberReply,
} from "../../../../src/server/session-driver/core/persona-memory-reply.ts"
import { fixedChatSummary } from "../../../fixture/chat.ts"
import { callTool } from "../../../fixture/mcp-server.ts"
import { TOOL_EXPRESSIONS, FAKE_CWD } from "../../../fixture/sdk-tool.ts"

describe("remember / forget ツール", () => {
  /** 渡す行（手で書いた架空のもの）。応答に混ざらないことを確かめる目印にもする。 */
  const SENT_LINE = "架空の目印つきの一行ZQX"

  function memoryServer(
    memory: PersonaMemory,
    allowsRemember: () => boolean,
  ): () => McpSdkServerConfigWithInstance {
    return () =>
      tsukumoServer(
        TOOL_EXPRESSIONS,
        {
          kind: "chat",
          personaMemory: memory,
          chatSummary: fixedChatSummary(undefined),
        },
        createCallReview(),
        () => {},
        FAKE_CWD,
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
