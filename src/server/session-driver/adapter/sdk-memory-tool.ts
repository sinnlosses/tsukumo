// 雑談のときの `remember` / `forget` ツールと、会話の記憶を引く `recall` / `recall_episode` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { chatRecallEpisodeText, chatRecallListText } from "../../chat/core/chat-memory-prompt.ts"
import {
  forgetReply,
  type PersonaMemoryReply,
  rememberReply,
} from "../core/persona-memory-reply.ts"
import type { ChatRecall, PersonaMemory } from "../core/session-driver.ts"
import {
  FORGET_TOOL_NAME,
  RECALL_EPISODE_TOOL_NAME,
  RECALL_TOOL_NAME,
  REMEMBER_TOOL_NAME,
} from "../core/tsukumo-tool-name.ts"

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

/**
 * モデルに見せる `recall` ツールの説明。
 * 雑談でいつ引くかの条は `CHAT_MANNER_PROMPT` が持つので、ここには何が返るかと引ける回数だけを書く。
 */
const RECALL_TOOL_DESCRIPTION =
  "前の話を思い出せないときに、言葉でエピソード索引を引き、当たった候補の一覧（id・見出し・要旨）を返す。逐語は返らない。" +
  "1件を開くには recall_episode を使う。当たらなければ候補は無い。引けるのは1ターンに2回まで。"

/**
 * モデルに見せる `recall_episode` ツールの説明。
 * 雑談でいつ開くかの条は `CHAT_MANNER_PROMPT` が持つので、ここには何が返るかと開ける回数だけを書く。
 */
const RECALL_EPISODE_TOOL_DESCRIPTION =
  "recall で見た候補の id を渡し、その1件の範囲の会話をそのままの文面で開く。" +
  "知らない id なら何も返らない。開けるのは1ターンに2件まで。"

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

/**
 * 索引を引いて古い会話の候補を見るツール。
 * 返すのはその会話自身の過去の目次（`id`・見出し・要旨）だけで、tsukumo の状態も画面の事情も載せない。
 * 文面に組み立てるのは core（`chatRecallListText`）で、採点・1ターンの回数の縛りは `createChatRecall`。
 */
export function recallTool(chatRecall: ChatRecall) {
  return tool(
    RECALL_TOOL_NAME,
    RECALL_TOOL_DESCRIPTION,
    { keyword: z.string().describe("引く言葉。語を空白で区切ると、どれかに当たった候補が返る") },
    async ({ keyword }) => ({
      content: [
        { type: "text" as const, text: chatRecallListText(chatRecall.recallList(keyword)) },
      ],
    }),
  )
}

/**
 * `recall` で見た候補を1件開くツール。返すのは開いた1件の範囲の逐語だけ。
 * 文面に組み立てるのは core（`chatRecallEpisodeText`）で、1ターンの回数の縛りは `createChatRecall`。
 */
export function recallEpisodeTool(chatRecall: ChatRecall) {
  return tool(
    RECALL_EPISODE_TOOL_NAME,
    RECALL_EPISODE_TOOL_DESCRIPTION,
    { id: z.string().describe("recall の一覧で見た候補の id") },
    async ({ id }) => ({
      content: [
        { type: "text" as const, text: chatRecallEpisodeText(chatRecall.recallEpisode(id)) },
      ],
    }),
  )
}

function personaMemoryToolResult(reply: PersonaMemoryReply) {
  return { content: [{ type: "text" as const, text: reply.text }], isError: reply.isError }
}
