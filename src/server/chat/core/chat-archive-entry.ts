// 届いたイベント1件を、会話のアーカイブの1行に変えるところ。
// 何を残すかを決めるのがここで、どこに・どんな形で書くかは持たない。
//
// 残すのは依頼・セリフ・仕事のターンの結論の3種類と、雑談の依頼に添えた画像の原寸だけで、本文（レポート）・ツールの入出力・
// 許可プロンプト・質問は渡さない。書き出してよい範囲は `docs/coding-standards.md`
// 「会話内容の扱い」の例外の表が決めている。
// 会話の文面と画像が引数として通るが、ログには出さない。

import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import type { RecordedPromptImage } from "../../../shared/session-driver/prompt-image.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { clipWithEllipsis } from "../../../shared/utils/clip-text.ts"
import type { ChatArchive } from "./chat-archive-port.ts"

/** 雑談の依頼に添えた画像の原寸を棚から引く口と、書けなかった1枚を知らせる口。 */
export type ChatArchiveImageSource = {
  /** id が指す原寸の data URL。棚に無ければ undefined。 */
  readonly find: (id: string) => string | undefined
  /** 1枚書けなかったことを知らせる（`error` は診断に落とす材料で、中身は読まない）。 */
  readonly reportFailure: (error: unknown) => void
}

/**
 * イベント1件を会話のアーカイブへ渡す。拾うのは依頼とセリフの2種類だけ。
 * `packName` がまだ分からない（`character-changed` が一度も届いていない）ときは何もしない。
 *
 * 仕事のとき（`mode === "work"`）は依頼の文面を {@link CHAT_MEMORY_BUDGET.workExcerptChars} で
 * 切り、切ったら末尾に「…」を付ける。雑談のときは切らない。
 *
 * 雑談の依頼に添えた画像は、行より先に原寸を書き、書けたファイル名を行に載せる。
 * 書けなかった1枚は行に載せず、`imageSource.reportFailure` に渡して続ける（行は書く）。
 */
export function appendChatArchiveEntry(
  chatArchive: ChatArchive,
  packName: string | undefined,
  mode: "chat" | "work",
  project: string,
  at: number,
  event: SessionEvent,
  imageSource: ChatArchiveImageSource,
): void {
  if (packName === undefined) {
    return
  }
  if (event.kind === "request") {
    const images = event.images.length > 0 ? event.images.length : undefined
    if (mode === "work") {
      chatArchive.append(packName, {
        mode,
        kind: "request",
        at,
        text: clipWithEllipsis(event.text, CHAT_MEMORY_BUDGET.workExcerptChars),
        project,
        images,
      })
      return
    }
    const written = writeChatImages(chatArchive, packName, at, event.images, imageSource)
    chatArchive.append(packName, {
      mode,
      kind: "request",
      at,
      text: event.text,
      images,
      imageFiles: written.length > 0 ? written : undefined,
    })
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
    text: clipWithEllipsis(conclusion, CHAT_MEMORY_BUDGET.workExcerptChars),
    project,
  })
}

/** 添えた順に1枚ずつ書き、書けたファイル名を返す。棚から落ちていた1枚も書けなかったものとして知らせる。 */
function writeChatImages(
  chatArchive: ChatArchive,
  packName: string,
  at: number,
  images: readonly RecordedPromptImage[],
  imageSource: ChatArchiveImageSource,
): readonly string[] {
  return images.flatMap((image) => {
    const dataUrl = imageSource.find(image.id)
    if (dataUrl === undefined) {
      imageSource.reportFailure(undefined)
      return []
    }
    const written = chatArchive.writeImage(packName, { id: image.id, at, dataUrl })
    if (written.kind === "failed") {
      imageSource.reportFailure(written.error)
      return []
    }
    return [written.fileName]
  })
}
