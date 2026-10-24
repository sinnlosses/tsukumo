// 雑談のときの `remember` / `forget` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  forgetReply,
  type PersonaMemoryReply,
  rememberReply,
} from "../core/persona-memory-reply.ts"
import type { PersonaMemory } from "../core/session-driver.ts"
import { FORGET_TOOL_NAME, REMEMBER_TOOL_NAME } from "../core/tsukumo-tool-name.ts"

/**
 * モデルに見せる `remember` ツールの説明。
 * 何を書いてよいかの条は `CHAT_MANNER_PROMPT` が持つので、ここには置き場所と形だけを書く（二重に書かない）。
 */
const REMEMBER_TOOL_DESCRIPTION =
  "キャラクター自身について決まったことを1行だけ覚える（好み・口調・呼び方・来歴）。" +
  "ユーザーについて知ったことは覚えない。呼ぶ条件は雑談モードの規約に従う。" +
  "この依頼のあいだに tsukumo の外のツール（Read・Bash・Web・他の MCP など）を使ったときと、同じ文面をもう覚えているときは書かれず、エラーが返る。"

/**
 * モデルに見せる `forget` ツールの説明。
 * 何を消してよいかの条は `CHAT_MANNER_PROMPT` が持つので、ここには指し方と範囲だけを書く（二重に書かない）。
 */
const FORGET_TOOL_DESCRIPTION =
  "「覚えたこと」に並んでいる1行を忘れる。消したい行の文面をそのまま渡す（完全一致。番号では指せない）。" +
  "消せるのは自分で覚えた行だけで、それ以外の人格の文面は消せない。呼ぶ条件は雑談モードの規約に従う。" +
  "一致する行が無ければ何も消えず、エラーが返る。"

/** 覚えたことを書き足すツール。書けたら "ok"、書けなかったら理由の固定文を `isError` で返す。 */
export function rememberTool(memory: PersonaMemory, allowsRemember: () => boolean) {
  return tool(
    REMEMBER_TOOL_NAME,
    REMEMBER_TOOL_DESCRIPTION,
    { line: z.string().describe("覚えること。キャラクター自身についての1行（120文字まで）") },
    async ({ line }) =>
      personaMemoryToolResult(
        rememberReply(allowsRemember() ? memory.remember(line) : "external-tool"),
      ),
  )
}

/** 覚えた1行を忘れるツール。消せたら "ok"、消せなかったら理由の固定文を `isError` で返す。 */
export function forgetTool(memory: PersonaMemory) {
  return tool(
    FORGET_TOOL_NAME,
    FORGET_TOOL_DESCRIPTION,
    { line: z.string().describe("忘れること。「覚えたこと」に並んでいる1行の文面そのまま") },
    async ({ line }) => personaMemoryToolResult(forgetReply(memory.forget(line))),
  )
}

function personaMemoryToolResult(reply: PersonaMemoryReply) {
  return { content: [{ type: "text" as const, text: reply.text }], isError: reply.isError }
}
