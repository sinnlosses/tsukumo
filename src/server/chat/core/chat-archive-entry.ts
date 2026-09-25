// 届いたイベント1件を、雑談の会話のアーカイブの1行に変えるところ（`docs/chat-mode.md` 4.9
// 「誰がいつ書くか」）。**何を残すかを決めるのがここ**で、どこに・どんな形で書くかは
// `src/server/chat/adapter/chat-archive.ts`、**いつ呼ぶか**（駆動由来・雑談モードのときだけ）は
// `src/server/session/core/session-manager.ts` の `receive`。
//
// **残すのは依頼とセリフの2種類だけ** — 本文（レポート）・ツールの入出力・許可プロンプト・
// 質問は渡さない（`docs/chat-mode.md` 4.9「広げていないこと」）。会話の文面が引数として通るが、
// ログには出さない（`docs/coding-standards.md`「会話内容の扱い」）。

import { type SessionEvent } from "../../../shared/session-event.ts"
import { type ChatArchive } from "../../session-driver/core/session-driver.ts"

/**
 * イベント1件を雑談の会話のアーカイブへ渡す。拾うのは `chatLogEntries`
 * （`src/shared/chat-log.ts`）と同じ2種類（依頼とセリフ）だけ。
 *
 * `packName` がまだ分からない（`character-changed` が一度も届いていない）ときは何もしない。
 */
export function appendChatArchiveEntry(
  chatArchive: ChatArchive,
  packName: string | undefined,
  at: number,
  event: SessionEvent,
): void {
  if (packName === undefined) {
    return
  }
  if (event.kind === "request") {
    chatArchive.append(packName, {
      speaker: "user",
      at,
      text: event.text,
      images: event.images.length > 0 ? event.images.length : undefined,
    })
    return
  }
  if (event.kind === "speech") {
    chatArchive.append(packName, {
      speaker: "character",
      at,
      text: event.text,
      expression: event.expression,
    })
  }
}
