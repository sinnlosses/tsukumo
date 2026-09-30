// 記憶（それより前のあらすじと直近の逐語）を `systemPrompt` に載せるときの文面を組み立てる。
// 雑談のセッションには載せるかどうかの判断ごと（`takeChatMemoryPromptParts`）、仕事のセッションには起こすたびに（`workMemoryPromptParts`）載せる。
// 前置きと1行の並べ方は両方のモードで同じ1つ。
//
// ターンの途中で `recall` / `recall_episode` が返す文面もここが組み立てる。
// 載る場所は違う（`systemPrompt` か、ツールの戻り値か）が、`recall_episode` が開いた1件の逐語の並べ方（話者の印・日付の見出し）は `systemPrompt` の節と同じ1つで、読む側が2通りを覚えずに済む。
//
// 雑談の判断は1箇所にまとめる。載せる条件は2つの記憶に共通で、載せたら写しの印を「渡し済み」に戻す。
// 2つの口に分けると、先に呼ばれたほうが印を戻してあとの1つが黙って載らない。
//
// 中身を読んで判定しない。
// 決めるのは「続きから始めないか」「写しの印が未渡しか」という構造だけの条件で、要約の文面も逐語の文面も素通りする。
// 読み戻した中身で判定する経路は作らない。

import type {
  ChatArchiveLine,
  ChatArchiveRecentEntry,
  ChatEpisodeCandidate,
  ChatRecallEpisodeResult,
  ChatRecallListResult,
  ChatSummary,
  SessionStart,
} from "../../session-driver/core/session-driver.ts"
import type { ChatArchive, ChatReadbackLimits } from "./chat-archive-port.ts"

/**
 * 要約の前置き。要約であって会話ではないことと引用しないことを短く添える。
 * 印の行はここに含めない（{@link ChatSummary.read} が返す `summary` はすでに印の行を含まない）。
 */
const CHAT_SUMMARY_PREFACE =
  "## これまでのあらすじ\n\n" +
  "以下は前回までの会話のあらすじ。会話そのものではなく、" +
  "そのままの引用でもない。踏まえてよいが、文面を読み上げたり引用したりしない。"

/**
 * 1行の印の読み方。直近の逐語と `recall_episode` の戻り値で同じ文面を使う。
 * 見出しは会話の発言ではないことをここで断る。
 */
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
  "続きとして踏まえてよいが、読み上げたり引用したりしない。" +
  "ここより前の話を思い出せないときは、`recall` で索引を引ける。"

/**
 * `recall` が当たったときの前置き。
 * 逐語は渡さず `id` / `title` / `gist` の一覧だけで、開くには `recall_episode` が要ることをここで断る。
 */
const CHAT_RECALL_LIST_PREFACE =
  "索引を引いた候補（点の高い順。逐語ではなく見出しと要旨だけ）。" +
  "思い出したい1件があれば、その `id` を渡して `recall_episode` で開く。"

/** 索引に当たる候補が無かったときの戻り値。 */
const CHAT_RECALL_LIST_NOT_FOUND =
  "索引に当たる候補が無かった。別の言葉で引き直すか、覚えていないことを正直に言う。"

/** そのターンで一覧の上限（`recallListsPerTurn`）まで引いたときの戻り値。 */
const CHAT_RECALL_LIST_EXHAUSTED =
  "このターンではもう一覧を引けない（引けるのは1ターンに2回）。次のターンで引き直す。"

/**
 * `recall_episode` が当たったときの前置き。
 * これはツールの戻り値としてターンの途中で入るので、いまの話の続きではないことをここで断る。
 */
const CHAT_RECALL_EPISODE_PREFACE =
  "候補の1件を開いた、その範囲の会話そのもの（要約ではない）。" +
  "**いま話していることの続きではなく、そのエピソードのやり取りをそのまま抜いたもの**で、" +
  "前後には残っていない会話がある。" +
  LINE_LABEL_GUIDE +
  "思い出した内容として踏まえてよいが、読み上げたり引用したりしない。"

/** `recall_episode` が `overflowed: true` を返したときに、逐語のあとへ足す一言。 */
const CHAT_RECALL_EPISODE_OVERFLOW_NOTE = "（続きがあるが、ここまで）"

/** 知らない `id`（一覧に無い・アーカイブの行が残っていない）のときの戻り値。 */
const CHAT_RECALL_EPISODE_NOT_FOUND =
  "その `id` のエピソードは無かった。`recall` で一覧をもう一度引き直すか、覚えていないことを正直に言う。"

/** そのターンで開ける上限（`recallEpisodesPerTurn`）まで開いたときの戻り値。 */
const CHAT_RECALL_EPISODE_EXHAUSTED =
  "このターンではもうエピソードを開けない（開けるのは1ターンに2件）。次のターンで開き直す。"

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
  /** 会話のアーカイブの口（読むのはここから起こすパックのぶんだけ）。 */
  readonly chatArchive: ChatArchive
  /** これから起こすキャラクターパックの名前。 */
  readonly packName: string
  /** 逐語で読み戻す量（バイト）。 */
  readonly readbackLimits: ChatReadbackLimits
}

/** {@link workMemoryPromptParts} に渡す口。あらすじの印は書き換えない（読む口しか渡さない）。 */
export type WorkMemorySources = {
  readonly chatSummary: Pick<ChatSummary, "read">
  readonly chatArchive: ChatArchive
  readonly packName: string
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

  const parts = memoryParts(
    record?.summary ?? "",
    sources.chatArchive.readRecent(sources.packName, sources.readbackLimits),
  )
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
    sources.chatArchive.readRecent(sources.packName, sources.readbackLimits),
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

/**
 * `recall` の結果をモデルへ返す文面に変える（`recall` ツールの戻り値）。
 * 当たったときだけ候補の一覧が入る。
 * 当たらなかったときと、そのターンで上限まで引いたときは短い一言だけで、会話の文面は1バイトも入らない（`id` / `title` / `gist` は目次で、逐語ではない）。
 *
 * ここと {@link chatRecallEpisodeText} が「戻り値は `"ok"` だけ」の例外（`docs/coding-standards.md`「会話内容の扱い」の読み戻しの表）。
 * 返しているのは tsukumo の状態ではなくその会話自身の過去なので、`docs/architecture/adr/0009-speech-via-tool.md`「戻り値は `"ok"` だけにする」が塞いでいる逆流路（tsukumo → モデル）は開かない。
 */
export function chatRecallListText(result: ChatRecallListResult): string {
  if (result.kind === "exhausted") {
    return CHAT_RECALL_LIST_EXHAUSTED
  }
  if (result.kind === "not-found") {
    return CHAT_RECALL_LIST_NOT_FOUND
  }
  return candidateListPart(result.candidates)
}

/**
 * `recall_episode` の結果をモデルへ返す文面に変える（`recall_episode` ツールの戻り値）。
 * 当たったときだけ逐語が入り、知らない `id`・そのターンで上限まで開いたときは短い一言だけ。
 * `overflowed` のときは、逐語のあとに続きがあることだけを添える（逐語そのものは増やさない）。
 */
export function chatRecallEpisodeText(result: ChatRecallEpisodeResult): string {
  if (result.kind === "exhausted") {
    return CHAT_RECALL_EPISODE_EXHAUSTED
  }
  if (result.kind === "not-found") {
    return CHAT_RECALL_EPISODE_NOT_FOUND
  }
  const verbatim = verbatimPart(CHAT_RECALL_EPISODE_PREFACE, result.entries)
  if (verbatim === undefined) {
    return CHAT_RECALL_EPISODE_NOT_FOUND
  }
  return result.overflowed ? `${verbatim}\n\n${CHAT_RECALL_EPISODE_OVERFLOW_NOTE}` : verbatim
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

/** 候補の一覧ぶんの文面（点の高い順のまま、`id` ・見出し・要旨を1行ずつ並べる）。 */
function candidateListPart(candidates: readonly ChatEpisodeCandidate[]): string {
  const lines = candidates.map(
    (candidate) => `- ${candidate.id}: ${candidate.title}（${candidate.gist}）`,
  )
  return `${CHAT_RECALL_LIST_PREFACE}\n\n${lines.join("\n")}`
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
