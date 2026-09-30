// 届いたイベント1件を、会話のアーカイブの1行に変えるところ。
// 何を残すかを決めるのがここで、どこに・どんな形で書くかは持たない。
//
// 残すのは依頼・セリフ・仕事のターンの結論の3種類だけで、本文（レポート）・ツールの入出力・
// 許可プロンプト・質問は渡さない。書き出してよい範囲は `docs/coding-standards.md`
// 「会話内容の扱い」の例外の表が決めている。
// 会話の文面が引数として通るが、ログには出さない。

import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ChatArchive } from "./chat-archive-port.ts"

/**
 * イベント1件を会話のアーカイブへ渡す。拾うのは依頼とセリフの2種類だけ。
 * `packName` がまだ分からない（`character-changed` が一度も届いていない）ときは何もしない。
 *
 * 仕事のとき（`mode === "work"`）は依頼の文面を {@link CHAT_MEMORY_BUDGET.workExcerptChars} で
 * 切り、切ったら末尾に「…」を付ける。雑談のときは切らない。
 */
export function appendChatArchiveEntry(
  chatArchive: ChatArchive,
  packName: string | undefined,
  mode: "chat" | "work",
  project: string,
  at: number,
  event: SessionEvent,
): void {
  if (packName === undefined) {
    return
  }
  if (event.kind === "request") {
    const text = mode === "work" ? excerptOf(event.text) : event.text
    const images = event.images.length > 0 ? event.images.length : undefined
    chatArchive.append(
      packName,
      mode === "work"
        ? { mode, kind: "request", at, text, project, images }
        : { mode, kind: "request", at, text, images },
    )
    return
  }
  if (event.kind === "speech") {
    chatArchive.append(
      packName,
      mode === "work"
        ? { mode, kind: "speech", at, text: event.text, project, expression: event.expression }
        : { mode, kind: "speech", at, text: event.text, expression: event.expression },
    )
  }
}

/**
 * そのターンで最後に届いた `report` の結論を1行、会話のアーカイブへ渡す（仕事のときだけ呼ぶ）。
 * 文面は {@link CHAT_MEMORY_BUDGET.workExcerptChars} で切り、切ったら末尾に「…」を付ける。
 * `packName` がまだ分からないときは何もしない。
 */
export function appendChatArchiveConclusion(
  chatArchive: ChatArchive,
  packName: string | undefined,
  project: string,
  at: number,
  conclusion: string,
): void {
  if (packName === undefined) {
    return
  }
  chatArchive.append(packName, {
    mode: "work",
    kind: "conclusion",
    at,
    text: excerptOf(conclusion),
    project,
  })
}

/** 先頭 {@link CHAT_MEMORY_BUDGET.workExcerptChars} 文字（コードポイント）で切り、切ったら「…」を付ける。 */
function excerptOf(text: string): string {
  const codePoints = [...text]
  const maxChars = CHAT_MEMORY_BUDGET.workExcerptChars
  return codePoints.length <= maxChars ? text : `${codePoints.slice(0, maxChars).join("")}…`
}
