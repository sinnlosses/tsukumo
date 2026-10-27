// 定着の指示文・依頼の文面の組み立て・出力の形（zod。JSON Schema はそこから導く）・出力の検査・モデルと時間切れ。
// 純関数と定数だけで、`query()` は起こさない。
//
// 渡す文面（畳む行・前のあらすじ）も受け取る出力（あらすじ・話題の見出し）もすべて会話の内容に当たる。
// ここで組んだ文面も検査の結果もログにもファイルにも書かない。
//
import { z } from "zod"

import { byteLength } from "../../core/byte-length.ts"
import { structuredOutputSchema } from "../../core/structured-output-schema.ts"
import type { StructuredQuery } from "../../core/structured-query.ts"
import type { ChatUnconsolidatedEntry } from "./chat-archive-port.ts"
import { CHAT_MEMORY_BUDGET } from "./chat-memory-budget.ts"
import { chatLineText } from "./chat-memory-prompt.ts"
import type { ChatSummary } from "./chat-memory.ts"

/** サイドバーの「最近の話題」に出す見出しの件数の上限。 */
const CHAT_TOPIC_LIMIT = 3

/** 定着を起こすモデル（軽いもの）。 */
const CHAT_CONSOLIDATION_MODEL = "haiku"

/** 定着1回の時間切れ（ミリ秒）。 */
export const CHAT_CONSOLIDATION_TIMEOUT_MS = 120_000

/**
 * 出力の形の文字数・件数の上限（正典は `docs/architecture/chat-mode.md`「窓から溢れた会話は定着で畳む」の「受け取る形」の表）。
 * 足りなければここだけ直す。
 */
export const CHAT_CONSOLIDATION_LIMITS = {
  /** 話題の見出し（`topics`）の件数の上限。 */
  topicsMax: 3,
  /** 話題の見出し1件の上限（文字）。 */
  topicChars: 40,
  /** 前のあらすじ（前後の空白を落とす）がこの字数に満たないときは、縮みを比べない。 */
  synopsisCompareMinChars: 120,
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
const CHAT_SYNOPSIS_RESERVED_TAGS = [
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
 * `shape-*` は構造化出力の最上位の形・`topics` の崩れ、`synopsis-*` はあらすじの空・長すぎ・予約タグの含有。
 */
const CHAT_CONSOLIDATION_REJECTIONS = [
  "shape-structure",
  "shape-topics",
  "synopsis-empty",
  "synopsis-too-long",
  "synopsis-reserved-tag",
] as const

export type ChatConsolidationRejection = (typeof CHAT_CONSOLIDATION_REJECTIONS)[number]

/** 前のあらすじが無い（空文字の）ときに置く文面。 */
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

渡された行と前のあらすじから、あらすじを書き直し、最近の話題の見出しを書く。

## あらすじ・話題の見出しに書いてよいものの線

- **自分の言葉で書き直す。** 発言をそのまま引用しない
- **利用者について知ったことは書かない**（名前・所属・家族・健康・予定・好み・感情・評価などを
  書き残さない）

## あらすじ（synopsis）

渡された「前のあらすじ」（無ければ空から）と、渡された行を踏まえて、あらすじの本文を
書き直す。空にしない。${String(CHAT_MEMORY_BUDGET.synopsisBytes)}バイト（UTF-8）までで、前のあらすじの半分より短くしない（古い話の筋を落としすぎない）。
\`<\` で始まる印の類は書かない。**話題の見出しはここに書かない**（\`topics\` に書くので、ここには
あらすじの地の文だけを書く）。

## 話題の見出し（topics）

直近の話題の見出しを、新しい順に0〜${String(CHAT_CONSOLIDATION_LIMITS.topicsMax)}件、各${String(CHAT_CONSOLIDATION_LIMITS.topicChars)}字までで書く。`

/** {@link chatConsolidationQuery} に渡す材料。 */
export type ChatConsolidationMaterial = {
  /** 畳む行（`ChatArchive` の `unconsolidated` が返す、古い→新しいの順。行番号はまだ無い）。 */
  readonly entries: readonly ChatUnconsolidatedEntry[]
  /** 前のあらすじ（無ければ空文字）。印の行と話題の見出しは含めない。 */
  readonly previousSynopsis: string
}

/** 検査を通った定着の出力。 */
export type ChatConsolidationResult = {
  readonly synopsis: string
  /** 新しい順、{@link CHAT_CONSOLIDATION_LIMITS.topicsMax} 件まで。 */
  readonly topics: readonly string[]
}

/** 材料から `query()` に渡すものを組む。 */
export function chatConsolidationQuery(material: ChatConsolidationMaterial): StructuredQuery {
  return {
    kind: "chat-consolidation",
    model: CHAT_CONSOLIDATION_MODEL,
    systemPrompt: CHAT_CONSOLIDATION_INSTRUCTION,
    prompt: chatConsolidationPrompt(material),
    images: [],
    schema: structuredOutputSchema(chatConsolidationSchema()),
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
 * - `synopsis` は空でなく、{@link CHAT_SYNOPSIS_RESERVED_TAGS} を含まず、{@link CHAT_MEMORY_BUDGET.synopsisBytes} バイト以下
 * - `topics` は0〜{@link CHAT_CONSOLIDATION_LIMITS.topicsMax}件、各{@link CHAT_CONSOLIDATION_LIMITS.topicChars}字まで
 */
export function parseChatConsolidationResult(value: unknown): ChatConsolidationCheck {
  const parsed = chatConsolidationSchema().safeParse(value)
  if (!parsed.success) {
    return rejected(firstRejection(parsed.error.issues.map(rejectionOf)))
  }
  return { kind: "accepted", result: parsed.data }
}

/**
 * 書き直したあらすじが、前のあらすじから縮みすぎているか。
 * 前のあらすじ（前後の空白を落とす）が {@link CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars} 字未満なら比べない。
 * 比べるときは、バイト数が前の {@link CHAT_CONSOLIDATION_LIMITS.synopsisKeepRatio} 倍未満なら縮みすぎ。
 */
export function chatSynopsisShrunk(synopsis: string, previousSynopsis: string): boolean {
  const previous = previousSynopsis.trim()
  if ([...previous].length < CHAT_CONSOLIDATION_LIMITS.synopsisCompareMinChars) {
    return false
  }
  return byteLength(synopsis) < byteLength(previous) * CHAT_CONSOLIDATION_LIMITS.synopsisKeepRatio
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
 * 畳む行を1始まりの行番号つきで並べ（日付が変わるところに見出しを挟む）、前のあらすじを続ける。
 */
function chatConsolidationPrompt(material: ChatConsolidationMaterial): string {
  return [
    "## 畳む行",
    numberedLines(material.entries),
    "## 前のあらすじ",
    material.previousSynopsis === "" ? NONE : material.previousSynopsis,
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

/**
 * 出力の形。JSON Schema（`outputFormat` に渡す）も検査もここから導く。
 * 検査に落ちた理由は message に置く（{@link rejectionOf}）。型の違いは zod の issue の種類から引く。
 */
function chatConsolidationSchema() {
  return z.object({
    synopsis: z
      .string()
      .trim()
      .min(1, "synopsis-empty")
      .refine((synopsis) => !hasReservedTag(synopsis), "synopsis-reserved-tag")
      .max(CHAT_MEMORY_BUDGET.synopsisBytes, "synopsis-too-long")
      .refine(
        (synopsis) => byteLength(synopsis) <= CHAT_MEMORY_BUDGET.synopsisBytes,
        "synopsis-too-long",
      ),
    topics: z
      .array(lineSchema(CHAT_CONSOLIDATION_LIMITS.topicChars))
      .max(CHAT_CONSOLIDATION_LIMITS.topicsMax, "shape-topics"),
  })
}

function lineSchema(maxChars: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxChars)
    .refine((line) => !line.includes("\n"))
}

/**
 * 検査に落ちた issue 1件の理由。
 * 最上位の欄の型の違いは `shape-structure`、`topics` の中は `shape-topics`、`synopsis` は message の理由。
 */
function rejectionOf(issue: z.core.$ZodIssue): ChatConsolidationRejection {
  const [field] = issue.path
  if (issue.code === "invalid_type" && issue.path.length <= 1) {
    return "shape-structure"
  }
  if (field === "synopsis") {
    return (
      CHAT_CONSOLIDATION_REJECTIONS.find((reason) => reason === issue.message) ?? "synopsis-empty"
    )
  }
  return field === "topics" ? "shape-topics" : "shape-structure"
}

/** 複数の欠陥があるときは、次の順で最初に当たる理由を返す（形 → あらすじ → 話題）。 */
function firstRejection(
  rejections: readonly ChatConsolidationRejection[],
): ChatConsolidationRejection {
  return REJECTION_PRIORITY.find((reason) => rejections.includes(reason)) ?? "shape-structure"
}

const REJECTION_PRIORITY = [
  "shape-structure",
  "synopsis-empty",
  "synopsis-reserved-tag",
  "synopsis-too-long",
  "shape-topics",
] as const satisfies readonly ChatConsolidationRejection[]

function rejected(rejection: ChatConsolidationRejection): ChatConsolidationCheck {
  return { kind: "rejected", rejection }
}

function hasReservedTag(synopsis: string): boolean {
  return CHAT_SYNOPSIS_RESERVED_TAGS.some((tag) => synopsis.includes(tag))
}
