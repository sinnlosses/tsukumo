// 定着の指示文・依頼の文面の組み立て・出力の形（JSON Schema）・出力の検査・モデルと時間切れ。
// 純関数と定数だけで、`query()` は起こさない。
//
// 渡す文面（畳む行・前のあらすじ・直前のエピソードの見出し）も受け取る出力（エピソード・あらすじ・話題の見出し）もすべて会話の内容に当たる。
// ここで組んだ文面も検査の結果もログにもファイルにも書かない。
//
import { isPlainObject } from "remeda"

import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import type { ChatSummary } from "../../session-driver/core/session-driver.ts"
import type { ChatEpisodeDraft, ChatUnconsolidatedEntry } from "./chat-archive-port.ts"
import { chatLineText } from "./chat-memory-prompt.ts"

/** サイドバーの「最近の話題」に出す見出しの件数の上限。 */
export const CHAT_TOPIC_LIMIT = 3

/** 定着を起こすモデル（軽いもの）。 */
const CHAT_CONSOLIDATION_MODEL = "haiku"

/** 定着1回の時間切れ（ミリ秒）。 */
export const CHAT_CONSOLIDATION_TIMEOUT_MS = 120_000

/**
 * 出力の形の文字数・件数の上限（正典は `docs/architecture/chat-mode.md`「窓から溢れた会話は定着で畳む」の「受け取る形」の表）。
 * 足りなければここだけ直す。
 */
export const CHAT_CONSOLIDATION_LIMITS = {
  /** エピソードの見出し（`title`）の上限（文字）。 */
  titleChars: 20,
  /** エピソードの要旨（`gist`）の上限（文字）。 */
  gistChars: 120,
  /** エピソードの手がかり語（`cues`）の件数の下限・上限。 */
  cuesMin: 1,
  cuesMax: 10,
  /** 手がかり語1件の上限（文字）。 */
  cueChars: 20,
  /** 話題の見出し（`topics`）の件数の上限。 */
  topicsMax: 3,
  /** 話題の見出し1件の上限（文字）。 */
  topicChars: 40,
  /**
   * 前のあらすじに対して、書き直したあらすじが最低限残すバイト数の割合。
   * 書き直しは「前のあらすじ＋新しい会話」の再要約なので、半分を切るのは一部が丸ごと落ちた形とみなす。
   */
  synopsisKeepRatio: 0.5,
  /** 前に書けてから縮みで落ちた回が、これに届く回は縮みの検査を外して書く。 */
  synopsisShrinkWaiveAt: 3,
} satisfies Readonly<Record<string, number>>

/**
 * 注入文の包みの印。あらすじに含まれていたら拒む。
 * `<topics>` は話題を本文に埋め込んでいた古い形、`<tsukumo-aside>` は脇の話の包み、`<tsukumo-progress>` は進みの差し込みの包み、`<agent-message` は委譲の引き継ぎの頭、
 * `<command-name>` などの3つは SDK が展開したスラッシュコマンド、`<system-reminder>`・`<task-notification>`・`<local-command-stdout>` は Claude Code が差し込む印。
 */
export const CHAT_SYNOPSIS_RESERVED_TAGS = [
  "<topics>",
  "</topics>",
  "<tsukumo-aside>",
  "</tsukumo-aside>",
  "<tsukumo-progress>",
  "</tsukumo-progress>",
  "<agent-message",
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<system-reminder>",
  "</system-reminder>",
  "<task-notification>",
  "</task-notification>",
  "<local-command-stdout>",
] as const

/**
 * 検査に落ちた理由。
 *
 * - `shape`: 構造化出力の形・エピソード・区切り・`topics` の崩れ
 * - `synopsis-empty`: あらすじが空
 * - `synopsis-too-long`: あらすじが `synopsisBytes` を超える
 * - `synopsis-reserved-tag`: あらすじが {@link CHAT_SYNOPSIS_RESERVED_TAGS} を含む
 */
const CHAT_CONSOLIDATION_REJECTIONS = [
  "shape",
  "synopsis-empty",
  "synopsis-too-long",
  "synopsis-reserved-tag",
] as const

export type ChatConsolidationRejection = (typeof CHAT_CONSOLIDATION_REJECTIONS)[number]

/** 前のあらすじ・直前のエピソードの見出しが無い（空文字の）ときに置く文面。 */
const NONE = "（なし）"

/**
 * `query()` の `systemPrompt` をそのまま置き換える指示文。
 * 会話の中のキャラクターの口調は持たず、要約する役目だけを持つ。
 */
const CHAT_CONSOLIDATION_INSTRUCTION = `あなたは、窓から溢れた会話を畳んで記憶にする役目だけを持つ。
ここでの「あなた」は畳む側であり、渡された会話の中のキャラクター本人ではない。

渡された行の \`利用者:\` は利用者の発言、\`あなた:\` はキャラクターのセリフ、\`したこと:\` は
仕事のターンでキャラクターがしたことの結論。\`[仕事: <プロジェクト名>]\` で始まる行は仕事のときの
やり取りで、印の無い行は雑談。

渡された行（1始まりの行番号つき）を、話題のまとまり（エピソード）に区切り、それぞれの
見出し・要旨・手がかり語・大事さを書く。そのうえで、あらすじを書き直し、最近の話題の見出しを書く。

## エピソードの区切り方

- 各エピソードは、そのエピソードの最後の行番号を \`end\` として返す
- \`end\` は前のエピソードの \`end\` より大きくする。**最後のエピソードの \`end\` は渡された最後の
  行番号と一致させる**（渡された行をすべて、切れ目なくどれかのエピソードに含める）
- 1件以上のエピソードを返す
- 話題が前の回（渡された「直前のエピソードの見出し」）から続いていても、それを書き換えることは
  できない。続きは新しいエピソードにする（見出しが似るのは構わない）

## 見出し・要旨・手がかり語・あらすじに書いてよいものの線

- **自分の言葉で書き直す。** 発言をそのまま引用しない
- **利用者について知ったことは書かない**（名前・所属・家族・健康・予定・好み・感情・評価などを
  書き残さない）
- \`title\`: ${String(CHAT_CONSOLIDATION_LIMITS.titleChars)}字までの短い見出し。改行を含まない
- \`gist\`: 1〜2文、${String(CHAT_CONSOLIDATION_LIMITS.gistChars)}字までの要旨
- \`cues\`: ${String(CHAT_CONSOLIDATION_LIMITS.cuesMin)}〜${String(CHAT_CONSOLIDATION_LIMITS.cuesMax)}個、各${String(CHAT_CONSOLIDATION_LIMITS.cueChars)}字までの手がかり語。あとで引きやすいよう、
  言い換え・上位の語を含めてよい

## 大事さ（weight）の目安

- **3**: 約束・頼まれた覚えごと・キャラクター自身に関わる決め事（仕事の行（\`[仕事: …]\`）だけのまとまりは 3 にならず、2 に下げられる）
- **2**: 中身のある話題
- **1**: 挨拶と相槌

## あらすじ（synopsis）

渡された「前のあらすじ」（無ければ空から）と、いま区切ったエピソードを踏まえて、あらすじの本文を
書き直す。空にしない。${String(CHAT_MEMORY_BUDGET.synopsisBytes)}バイト（UTF-8）までで、前のあらすじの半分より短くしない（古い話の筋を落としすぎない）。
\`<\` で始まる印の類は書かない。**話題の見出しはここに書かない**（\`topics\` に書くので、ここには
あらすじの地の文だけを書く）。ここでも発言を引用しない。

## 話題の見出し（topics）

直近の話題の見出しを、新しい順に0〜${String(CHAT_CONSOLIDATION_LIMITS.topicsMax)}件、各${String(CHAT_CONSOLIDATION_LIMITS.topicChars)}字までで書く。ここでも発言を引用しない。`

/** {@link chatConsolidationQuery} に渡す材料。 */
export type ChatConsolidationMaterial = {
  /** 畳む行（`ChatArchive` の `unconsolidated` が返す、古い→新しいの順。行番号はまだ無い）。 */
  readonly entries: readonly ChatUnconsolidatedEntry[]
  /** 前のあらすじ（無ければ空文字）。印の行と話題の見出しは含めない。 */
  readonly previousSynopsis: string
  /** 直前のエピソードの見出し（無ければ空文字）。 */
  readonly previousEpisodeTitle: string
}

/** `query()` に渡すもの（モデル・指示文・依頼の文面・出力の形）。 */
export type ChatConsolidationQuery = {
  readonly model: string
  readonly systemPrompt: string
  readonly prompt: string
  readonly schema: Readonly<Record<string, unknown>>
}

/** 検査を通ったエピソード1件（行番号のまま。`from` / `to` への変換は {@link chatEpisodeDrafts}）。 */
export type ChatConsolidationEpisode = {
  readonly end: number
  readonly title: string
  readonly gist: string
  readonly cues: readonly string[]
  readonly weight: 1 | 2 | 3
}

/** 検査を通った定着の出力。 */
export type ChatConsolidationResult = {
  readonly episodes: readonly ChatConsolidationEpisode[]
  readonly synopsis: string
  /** 新しい順、{@link CHAT_CONSOLIDATION_LIMITS.topicsMax} 件まで。 */
  readonly topics: readonly string[]
}

/** 材料から `query()` に渡すものを組む。 */
export function chatConsolidationQuery(
  material: ChatConsolidationMaterial,
): ChatConsolidationQuery {
  return {
    model: CHAT_CONSOLIDATION_MODEL,
    systemPrompt: CHAT_CONSOLIDATION_INSTRUCTION,
    prompt: chatConsolidationPrompt(material),
    schema: chatConsolidationSchema(),
  }
}

export type ChatConsolidationCheck =
  | { readonly kind: "accepted"; readonly result: ChatConsolidationResult }
  | { readonly kind: "rejected"; readonly rejection: ChatConsolidationRejection }

/**
 * 受け取った `structured_output` を丸ごと検査する。
 * 1か所でも崩れていたら `rejected` で、行は未定着のまま残る側に倒す。
 * 前のあらすじからの縮みはここでは見ない（{@link chatSynopsisShrunk}）。
 *
 * - 形: `episodes` が1件以上の配列で、各要素の `title` / `gist` / `cues` / `weight` が {@link CHAT_CONSOLIDATION_LIMITS} に収まる
 * - 区切り: `end` が前のエピソードより大きく、最後のエピソードの `end` が `lineCount` と一致（渡した行をすべて、切れ目なくどれかのエピソードに含めている）
 * - `synopsis` は空でなく、{@link CHAT_SYNOPSIS_RESERVED_TAGS} を含まず、{@link CHAT_MEMORY_BUDGET.synopsisBytes} バイト以下。`topics` は0〜{@link CHAT_CONSOLIDATION_LIMITS.topicsMax}件、各{@link CHAT_CONSOLIDATION_LIMITS.topicChars}字まで
 */
export function parseChatConsolidationResult(
  value: unknown,
  lineCount: number,
): ChatConsolidationCheck {
  if (
    !isPlainObject(value) ||
    !Array.isArray(value.episodes) ||
    typeof value.synopsis !== "string" ||
    !Array.isArray(value.topics)
  ) {
    return SHAPE_REJECTED
  }

  const synopsis = value.synopsis.trim()
  const synopsisRejection = synopsisRejectionOf(synopsis)
  if (synopsisRejection !== undefined) {
    return { kind: "rejected", rejection: synopsisRejection }
  }

  const episodes = value.episodes.map(toEpisode)
  if (!episodes.every((episode): episode is ChatConsolidationEpisode => episode !== undefined)) {
    return SHAPE_REJECTED
  }
  if (!coversLinesContiguously(episodes, lineCount)) {
    return SHAPE_REJECTED
  }

  const topics = value.topics.map(toTopic)
  if (
    topics.length > CHAT_CONSOLIDATION_LIMITS.topicsMax ||
    !topics.every((topic): topic is string => topic !== undefined)
  ) {
    return SHAPE_REJECTED
  }

  return { kind: "accepted", result: { episodes, synopsis, topics } }
}

/**
 * 書き直したあらすじが、前のあらすじから縮みすぎているか。
 * 前のあらすじ（前後の空白を落とす）が {@link CHAT_CONSOLIDATION_LIMITS.gistChars} 字未満なら比べない。
 * 比べるときは、バイト数が前の {@link CHAT_CONSOLIDATION_LIMITS.synopsisKeepRatio} 倍未満なら縮みすぎ。
 */
export function chatSynopsisShrunk(synopsis: string, previousSynopsis: string): boolean {
  const previous = previousSynopsis.trim()
  if ([...previous].length < CHAT_CONSOLIDATION_LIMITS.gistChars) {
    return false
  }
  return byteLength(synopsis) < byteLength(previous) * CHAT_CONSOLIDATION_LIMITS.synopsisKeepRatio
}

/**
 * 行番号の区切り（{@link ChatConsolidationEpisode.end}）を、渡した行の {@link ChatUnconsolidatedEntry.at} を使って {@link ChatEpisodeDraft.from} / `.to` に直す。
 *
 * {@link parseChatConsolidationResult} が `entries.length` を `lineCount` として検査を通した `episodes` を渡す前提（区切りが切れ目なく `entries` を覆っている）。
 * 前提が崩れているときは、変換できないエピソードを飛ばす（例外を投げない）。
 * 行範囲に雑談の行が無いエピソードの weight 3 は 2 に下げる（約束を機械で決められる欄は元の行に無く、仕事だけの範囲は雑談の覚えごとに当たらない）。
 */
export function chatEpisodeDrafts(
  entries: readonly ChatUnconsolidatedEntry[],
  episodes: readonly ChatConsolidationEpisode[],
): readonly ChatEpisodeDraft[] {
  const drafts: ChatEpisodeDraft[] = []
  let start = 0
  for (const episode of episodes) {
    const endIndex = episode.end - 1
    const from = entries[start]?.at
    const to = entries[endIndex]?.at
    if (from !== undefined && to !== undefined && endIndex >= start) {
      drafts.push({
        from,
        to,
        title: episode.title,
        gist: episode.gist,
        cues: episode.cues,
        weight: cappedWeight(episode.weight, entries.slice(start, endIndex + 1)),
      })
    }
    start = endIndex + 1
  }
  return drafts
}

/**
 * パック1つぶんの写しを読み、最近の話題の見出しにして返す（{@link CHAT_TOPIC_LIMIT} 件まで。写しがまだ無い・読めないときは空）。
 * 書いたあとの写しを読み直すので、画面に出る見出しは次に起こしたときと同じものになる。
 */
export function readChatTopics(chatSummary: Pick<ChatSummary, "readTopics">): readonly string[] {
  return chatSummary.readTopics().slice(0, CHAT_TOPIC_LIMIT)
}

/**
 * 依頼の文面。
 * 畳む行を1始まりの行番号つきで並べ（日付が変わるところに見出しを挟む）、前のあらすじと直前のエピソードの見出しを続ける。
 */
function chatConsolidationPrompt(material: ChatConsolidationMaterial): string {
  return [
    "## 畳む行",
    numberedLines(material.entries),
    "## 前のあらすじ",
    material.previousSynopsis === "" ? NONE : material.previousSynopsis,
    "## 直前のエピソードの見出し",
    material.previousEpisodeTitle === "" ? NONE : material.previousEpisodeTitle,
  ].join("\n\n")
}

/**
 * 畳む行を「n. 印 話者: 文面」の並びにする（1始まりの行番号。印と話者は {@link chatLineText}）。
 * 日付が変わるところに `### <日付>` の見出しを挟む。表情・画像の枚数・時刻は載せない。
 */
function numberedLines(entries: readonly ChatUnconsolidatedEntry[]): string {
  const lines: string[] = []
  let lastDate: string | undefined
  entries.forEach((entry, index) => {
    const date = entry.at.slice(0, 10)
    if (date !== lastDate) {
      lines.push(`### ${date}`)
      lastDate = date
    }
    lines.push(`${String(index + 1)}. ${chatLineText(entry)}`)
  })
  return lines.join("\n")
}

/** 出力の JSON Schema（`outputFormat: { type: "json_schema", schema }` にそのまま渡す）。 */
function chatConsolidationSchema(): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    properties: {
      episodes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            end: { type: "integer", minimum: 1 },
            title: { type: "string" },
            gist: { type: "string" },
            cues: {
              type: "array",
              minItems: CHAT_CONSOLIDATION_LIMITS.cuesMin,
              maxItems: CHAT_CONSOLIDATION_LIMITS.cuesMax,
              items: { type: "string" },
            },
            weight: { type: "integer", enum: [1, 2, 3] },
          },
          required: ["end", "title", "gist", "cues", "weight"],
          additionalProperties: false,
        },
      },
      synopsis: { type: "string", minLength: 1, maxLength: CHAT_MEMORY_BUDGET.synopsisBytes },
      topics: {
        type: "array",
        maxItems: CHAT_CONSOLIDATION_LIMITS.topicsMax,
        items: { type: "string" },
      },
    },
    required: ["episodes", "synopsis", "topics"],
    additionalProperties: false,
  }
}

function cappedWeight(weight: 1 | 2 | 3, range: readonly ChatUnconsolidatedEntry[]): 1 | 2 | 3 {
  return weight === 3 && !range.some((entry) => entry.origin.mode === "chat") ? 2 : weight
}

const SHAPE_REJECTED = {
  kind: "rejected",
  rejection: "shape",
} as const satisfies ChatConsolidationCheck

/**
 * 前後の空白を落としたあらすじが形の検査に落ちる理由（通れば `undefined`）。
 * 中身の意味は見ない（空・決まった印の含有・長さだけ）。
 */
function synopsisRejectionOf(synopsis: string): ChatConsolidationRejection | undefined {
  if (synopsis === "") {
    return "synopsis-empty"
  }
  if (CHAT_SYNOPSIS_RESERVED_TAGS.some((tag) => synopsis.includes(tag))) {
    return "synopsis-reserved-tag"
  }
  if (byteLength(synopsis) > CHAT_MEMORY_BUDGET.synopsisBytes) {
    return "synopsis-too-long"
  }
  return undefined
}

/** `episodes` の1件を検査して畳む（崩れていたら `undefined`）。 */
function toEpisode(value: unknown): ChatConsolidationEpisode | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const { end, title, gist, cues, weight } = value
  if (typeof end !== "number" || !Number.isInteger(end) || end < 1) {
    return undefined
  }
  const trimmedTitle = toLine(title, CHAT_CONSOLIDATION_LIMITS.titleChars)
  if (trimmedTitle === undefined) {
    return undefined
  }
  const trimmedGist = toText(gist, CHAT_CONSOLIDATION_LIMITS.gistChars)
  if (trimmedGist === undefined) {
    return undefined
  }
  const trimmedCues = toCues(cues)
  if (trimmedCues === undefined) {
    return undefined
  }
  if (weight !== 1 && weight !== 2 && weight !== 3) {
    return undefined
  }
  return { end, title: trimmedTitle, gist: trimmedGist, cues: trimmedCues, weight }
}

/** `cues` の並びを検査して畳む（件数・各要素の形。崩れていたら `undefined`）。 */
function toCues(value: unknown): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length < CHAT_CONSOLIDATION_LIMITS.cuesMin ||
    value.length > CHAT_CONSOLIDATION_LIMITS.cuesMax
  ) {
    return undefined
  }
  const cues = value.map((cue) => toLine(cue, CHAT_CONSOLIDATION_LIMITS.cueChars))
  return cues.every((cue): cue is string => cue !== undefined) ? cues : undefined
}

/** `topics` の1件を検査して畳む（空でない・改行を含まない・上限内。崩れていたら `undefined`）。 */
function toTopic(value: unknown): string | undefined {
  return toLine(value, CHAT_CONSOLIDATION_LIMITS.topicChars)
}

/** 空でない・改行を含まない・文字数が上限以下の1行（前後の空白は落とす）。 */
function toLine(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === "" || trimmed.includes("\n") || [...trimmed].length > maxChars) {
    return undefined
  }
  return trimmed
}

/** 空でない・文字数が上限以下の文面（前後の空白は落とす。改行は許す＝1〜2文の要旨向け）。 */
function toText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" || [...trimmed].length > maxChars ? undefined : trimmed
}

/** `episodes` が `lineCount` 行を切れ目なく覆っているか（`end` が前のエピソードより大きく、最後の `end` が `lineCount` と一致）。 */
function coversLinesContiguously(
  episodes: readonly ChatConsolidationEpisode[],
  lineCount: number,
): boolean {
  if (episodes.length === 0) {
    return false
  }
  let previousEnd = 0
  for (const episode of episodes) {
    if (episode.end <= previousEnd) {
      return false
    }
    previousEnd = episode.end
  }
  return previousEnd === lineCount
}
