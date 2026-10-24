// 記憶（それより前のあらすじと直近の逐語）を `systemPrompt` に載せるときの文面を組み立てる。
// 雑談のセッションには載せるかどうかの判断ごと（`takeChatMemoryPromptParts`）、仕事のセッションには起こすたびに（`workMemoryPromptParts`）載せる。
// 前置きと1行の並べ方は両方のモードで同じ1つ。
//
// 雑談の判断は1箇所にまとめる。載せる条件は2つの記憶に共通で、載せたら写しの印を「渡し済み」に戻す。
// 2つの口に分けると、先に呼ばれたほうが印を戻してあとの1つが黙って載らない。
//
// 中身を読んで判定しない。
// 決めるのは「続きから始めないか」「写しの印が未渡しか」という構造だけの条件で、要約の文面も逐語の文面も素通りする。
// 読み戻した中身で判定する経路は作らない。

import type { ChatSummary, SessionStart } from "../../session-driver/core/session-driver.ts"
import type {
  ChatArchiveLine,
  ChatArchiveRecentEntry,
  ChatReadbackLimits,
} from "./chat-archive-port.ts"

/**
 * 要約の前置き。要約であって会話ではないことと引用しないことを短く添える。
 * 印の行はここに含めない（{@link ChatSummary.read} が返す `summary` はすでに印の行を含まない）。
 */
const CHAT_SUMMARY_PREFACE =
  "## これまでのあらすじ\n\n" +
  "以下は前回までの会話のあらすじ。会話そのものではなく、" +
  "そのままの引用でもない。踏まえてよいが、文面を読み上げたり引用したりしない。"

/** 1行の印の読み方。見出しは会話の発言ではないことをここで断る。 */
const LINE_LABEL_GUIDE =
  "`利用者:` が利用者の発言、`あなた:` があなた自身の過去のセリフ、" +
  "`したこと:` は仕事のターンであなたがしたことの結論。" +
  "`[仕事: <プロジェクト名>]` で始まる行は仕事のときのやり取りで、印の無い行は雑談。" +
  "`### ` で始まる行は日付の見出しで、会話の発言ではない。"

/**
 * 逐語の前置き。要約と違って会話の文面そのものであることと、話者の見分け方を添える。
 * いつごろの話かは日付が変わるところに挟む `### <日付>` の見出しで足りる（表情も画像の枚数も載せない）。
 */
const CHAT_RECENT_PREFACE =
  "## 直近の会話（そのままの文面）\n\n" +
  "以下は直近のやり取りそのもの（要約ではない）。" +
  LINE_LABEL_GUIDE +
  "続きとして踏まえてよいが、読み上げたり引用したりしない。"

/** 逐語の1行の頭に置く話者の印（行の種類ごと）。 */
const LINE_KIND_LABEL = {
  request: "利用者",
  speech: "あなた",
  conclusion: "したこと",
} as const satisfies Record<ChatArchiveLine["kind"], string>

/** {@link takeChatMemoryPromptParts} に渡す口と条件。 */
export type ChatMemorySources = {
  /** 新規に起こすか、続きから始めるか。 */
  readonly start: SessionStart
  /** あらすじの写しの口。 */
  readonly chatSummary: ChatSummary
  /** これから起こすパックの直近の逐語を読む口（パックはここで縛ってある）。 */
  readonly readRecent: ReadRecent
  /** 逐語で読み戻す量（バイト）。 */
  readonly readbackLimits: ChatReadbackLimits
}

/** 読むパックを縛った `ChatArchive.readRecent`。 */
export type ReadRecent = (limits: ChatReadbackLimits) => readonly ChatArchiveRecentEntry[]

/** {@link workMemoryPromptParts} に渡す口。あらすじの印は書き換えない（読む口しか渡さない）。 */
export type WorkMemorySources = {
  readonly chatSummary: Pick<ChatSummary, "read">
  readonly readRecent: ReadRecent
  readonly readbackLimits: ChatReadbackLimits
}

/**
 * `systemPrompt` に足す、雑談のセッションの記憶ぶんの文面（載せないときは空。古い→新しいの順で、要約・直近の逐語の2つ）。
 *
 * 載せる条件は2つで、どちらかに当たれば載せる（要約と逐語に共通）:
 *
 * 1. 新規に起こす（`start.kind` が `"new"`）
 * 2. 続きから始めるが、写しの印が「未渡し」
 *
 * どちらでもなければ載せない（続きから始めた文脈には同じ会話も同じ要約も既にある）。
 * 印が無い・読めないときは「未渡し」として扱い、黙って記憶が消えるほうへ倒さない。
 * 載せたら印を「渡し済み」に戻す（起こし直しのたびに重ねないため）。
 *
 * 写しがまだ無くても逐語は載る。条件を決めるのは `start` と印だけで、要約があるかどうかではない。
 *
 * 名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから（2度目の呼び出しは同じ文面を返さない）。
 */
export function takeChatMemoryPromptParts(sources: ChatMemorySources): readonly string[] {
  const { chatSummary } = sources
  const record = chatSummary.read()
  const delivered = record?.delivered ?? false
  if (sources.start.kind === "resume" && delivered) {
    return []
  }

  const parts = memoryParts(record?.summary ?? "", sources.readRecent(sources.readbackLimits))
  if (parts.length === 0) {
    return []
  }

  chatSummary.markDelivered()
  return parts
}

/**
 * `systemPrompt` に足す、仕事のセッションの記憶ぶんの文面（あらすじ・直近の逐語の順。どちらも無ければ空）。
 * 載せる条件は持たず、起こすたびに載せる。あらすじの印は読みも書きもしない。
 */
export function workMemoryPromptParts(sources: WorkMemorySources): readonly string[] {
  return memoryParts(
    sources.chatSummary.read()?.summary ?? "",
    sources.readRecent(sources.readbackLimits),
  )
}

/**
 * 逐語の1行を「印 話者: 文面」にする。
 * 仕事の行には `[仕事: <プロジェクト名>]` を前に添え、`conclusion` の行は話者の印を「したこと」に分ける。
 */
export function chatLineText(line: ChatArchiveLine): string {
  const origin = line.origin.mode === "work" ? `[仕事: ${line.origin.project}] ` : ""
  return `${origin}${LINE_KIND_LABEL[line.kind]}: ${line.text}`
}

/** あらすじと直近の逐語を、並び順のまま節にする（空の節は落とす）。 */
function memoryParts(
  summary: string,
  entries: readonly ChatArchiveRecentEntry[],
): readonly string[] {
  const recent = verbatimPart(CHAT_RECENT_PREFACE, entries)
  return [
    ...(summary === "" ? [] : [`${CHAT_SUMMARY_PREFACE}\n\n${summary}`]),
    ...(recent === undefined ? [] : [recent]),
  ]
}

/**
 * 逐語ぶんの1節（1件も無いときは undefined）。
 * 日付が変わるところに `### <日付>` の見出しを挟む（同じ日が続く間は見出しを重ねない）。
 * `entries` は渡された順のまま並べるだけで、中身を読んで落としたり並べ替えたりしない。
 */
function verbatimPart(
  preface: string,
  entries: readonly ChatArchiveRecentEntry[],
): string | undefined {
  if (entries.length === 0) {
    return undefined
  }

  const lines: string[] = []
  let lastDate: string | undefined
  for (const entry of entries) {
    if (entry.date !== lastDate) {
      lines.push(`### ${entry.date}`)
      lastDate = entry.date
    }
    lines.push(chatLineText(entry))
  }
  return `${preface}\n\n${lines.join("\n")}`
}
