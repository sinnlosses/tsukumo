// 定着（`docs/design.md` 7章「定着はどこで走るか」、`docs/chat-mode.md` 4.9「窓から溢れた会話は
// 定着で畳む」）の指示文・依頼の文面の組み立て・出力の形（JSON Schema）・出力の検査・モデルと
// 時間切れ。**純関数と定数だけ**で、外の世界には触らない（原則2）。`query()` を起こすのは
// `src/server/chat/adapter/sdk-chat-consolidation.ts`（原則3）。
//
// 渡す文面（畳む行・前のあらすじ・直前のエピソードの見出し）も受け取る出力（エピソード・
// あらすじ・話題の見出し）もすべて会話の内容に当たる。ここで組んだ文面も検査の結果も
// ログにもファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。
//
// **`<topics>` の組の書き方と取り出し方はここでは持たない**（いまは `chat-compact.ts` の
// `chatTopics`。`/compact` をやめるタスクでこちらへ移す。docs/design.md 7章の「注意」）。ここが
// 持つのは、検査を通った `topics` の配列を返すところまで。
//
// 呼び出し順と書く先は `chat-consolidation-writer.ts`、書く契機（雑談のターンの終わり・同時に1本）は
// `src/server/session/core/session-manager.ts` が持つ（ここでは決めない）。

import { isPlainObject } from "remeda"

import {
  type ChatEpisodeDraft,
  type ChatUnconsolidatedEntry,
} from "../../session-driver/core/session-driver.ts"

/** 定着を起こすモデル（軽いもの。値の根拠は `docs/chat-mode.md` 4.9）。 */
export const CHAT_CONSOLIDATION_MODEL = "haiku"

/** 定着1回の時間切れ（ミリ秒。日記の問い合わせと同じ120秒。値の根拠は `docs/chat-mode.md` 4.9）。 */
export const CHAT_CONSOLIDATION_TIMEOUT_MS = 120_000

/**
 * 出力の形の文字数・件数の上限（`docs/design.md` 7章「定着はどこで走るか」の表）。
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
} satisfies Readonly<Record<string, number>>

/** 逐語の1行の頭に置く話者の印（`chat-memory-prompt.ts` の `SPEAKER_LABEL` と同じ考え方）。 */
const SPEAKER_LABEL = {
  user: "利用者",
  character: "あなた",
} as const satisfies Record<ChatUnconsolidatedEntry["speaker"], string>

/** 前のあらすじ・直前のエピソードの見出しが無いときの文面（空文字。`visitCast` の `toSide` と同じ）。 */
const NONE = "（なし）"

/**
 * `query()` の `systemPrompt` をそのまま置き換える指示文。会話の中のキャラクターの口調は持たず、
 * 要約する役目だけを持つ（`docs/design.md` 7章「起こし方」）。
 */
export const CHAT_CONSOLIDATION_INSTRUCTION = `あなたは、窓から溢れた雑談の会話を畳んで記憶にする役目だけを持つ。
ここでの「あなた」は畳む側であり、渡された会話の中のキャラクター本人ではない。

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

- **3**: 約束・頼まれた覚えごと・キャラクター自身に関わる決め事
- **2**: 中身のある話題
- **1**: 挨拶と相槌

## あらすじ（synopsis）

渡された「前のあらすじ」（無ければ空から）と、いま区切ったエピソードを踏まえて、あらすじの本文を
書き直す。空文字でもよい。**\`<topics>\` のような印は書かない**（別の場所で組むので、ここには
あらすじの地の文だけを書く）。ここでも発言を引用しない。

## 話題の見出し（topics）

直近の話題の見出しを、新しい順に0〜${String(CHAT_CONSOLIDATION_LIMITS.topicsMax)}件、各${String(CHAT_CONSOLIDATION_LIMITS.topicChars)}字までで書く。ここでも発言を引用しない。`

/** {@link chatConsolidationQuery} に渡す材料。 */
export type ChatConsolidationMaterial = {
  /** 畳む行（`chat-archive.ts` の `unconsolidated` が返す、古い→新しいの順。行番号はまだ無い）。 */
  readonly entries: readonly ChatUnconsolidatedEntry[]
  /** 前のあらすじ（無ければ空文字）。印の行と `<topics>` の組は含めない。 */
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

/**
 * 受け取った `structured_output` を検査する（{@link parseVisitScript} と同じ形。**丸ごと**——
 * 1か所でも崩れていたら `undefined` で、行は未定着のまま残る側に倒す）。
 *
 * - 形: `episodes` が1件以上の配列で、各要素の `title` / `gist` / `cues` / `weight` が
 *   {@link CHAT_CONSOLIDATION_LIMITS} に収まる
 * - 区切り: `end` が前のエピソードより大きく、**最後のエピソードの `end` が `lineCount` と一致**
 *   （渡した行をすべて、切れ目なくどれかのエピソードに含めている）
 * - `synopsis` は文字列（空文字も許す）。`topics` は0〜{@link CHAT_CONSOLIDATION_LIMITS.topicsMax}件、
 *   各{@link CHAT_CONSOLIDATION_LIMITS.topicChars}字まで
 */
export function parseChatConsolidationResult(
  value: unknown,
  lineCount: number,
): ChatConsolidationResult | undefined {
  if (
    !isPlainObject(value) ||
    !Array.isArray(value.episodes) ||
    typeof value.synopsis !== "string" ||
    !Array.isArray(value.topics)
  ) {
    return undefined
  }

  const episodes = value.episodes.map(toEpisode)
  if (!episodes.every((episode): episode is ChatConsolidationEpisode => episode !== undefined)) {
    return undefined
  }
  if (!coversLinesContiguously(episodes, lineCount)) {
    return undefined
  }

  const topics = value.topics.map(toTopic)
  if (
    topics.length > CHAT_CONSOLIDATION_LIMITS.topicsMax ||
    !topics.every((topic): topic is string => topic !== undefined)
  ) {
    return undefined
  }

  return { episodes, synopsis: value.synopsis, topics }
}

/**
 * 行番号の区切り（{@link ChatConsolidationEpisode.end}）を、渡した行の {@link ChatUnconsolidatedEntry.at}
 * を使って {@link ChatEpisodeDraft.from} / `.to` に直す純関数（`docs/design.md` 7章
 * 「区切りを行番号で返させる」）。
 *
 * **{@link parseChatConsolidationResult} が `entries.length` を `lineCount` として検査を通した
 * `episodes` を渡す前提**（区切りが切れ目なく `entries` を覆っている）。前提が崩れているときは
 * 変換できないエピソードを飛ばす（例外を投げない。原則2の純関数でも「壊れていたら作らない」の
 * 倒れ方は揃える）。
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
        weight: episode.weight,
      })
    }
    start = endIndex + 1
  }
  return drafts
}

/**
 * 依頼の文面。畳む行を1始まりの行番号つきで並べ（日付が変わるところに見出しを挟む）、前のあらすじと
 * 直前のエピソードの見出しを続ける（`docs/design.md` 7章「渡すもの」）。
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
 * 畳む行を「n. 話者: 文面」の並びにする（1始まりの行番号）。日付が変わるところに
 * `### <日付>` の見出しを挟む（`chat-memory-prompt.ts` の `verbatimPart` と同じ考え方。
 * **表情・画像の枚数・時刻は載せない**）。
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
    lines.push(`${String(index + 1)}. ${SPEAKER_LABEL[entry.speaker]}: ${entry.text}`)
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
      synopsis: { type: "string" },
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

/**
 * `episodes` が `lineCount` 行を切れ目なく覆っているか（`end` が前のエピソードより大きく、
 * 最後の `end` が `lineCount` と一致）。
 */
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
