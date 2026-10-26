// トークン消費の記録の形。
//
// 書いてよいのは数・モデルの名前・ツールの名前・時刻・セッションID・モードだけ。
// 依頼の文面・セリフ・ツールの引数と結果は1文字も持たせない。
// 型にそもそも文字列の口を作らないことで、あとから足せないようにしてある（長さは数なので、結果の大きさだけは残せる）。
//
// この線は広げない。
// コンテキストの内訳（メモリファイルのパスやスキル名を持つ）はここには入れず、別の形・別のファイル（`ContextUsageRecord`）に積む。

import { z } from "zod"

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const TOKEN_USAGE_FORMAT_VERSION = 3 satisfies number

/** 読める古い版（`taskId`・`stage` の欄が無い版）。読むときだけ通し、書くのは常に {@link TOKEN_USAGE_FORMAT_VERSION}。 */
const TOKEN_USAGE_LEGACY_FORMAT_VERSION = 2 satisfies number

/** そのターンが仕事だったか雑談だったか。 */
export type TokenUsageMode = "work" | "chat"

/**
 * モデル1つぶんの使用量。SDK の `modelUsage` の1件を写した形で、数だけを持つ（`inputTokens` などの名前も `sdk.d.ts` に合わせてある）。
 * 記録に書くときは「前の `result` からの増分」で、SDK から届く累計そのものではない。
 */
const modelTokenUsageSchema = z
  .object({
    /** モデルの名前（SDK の `modelUsage` の鍵をそのまま）。 */
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    thinkingTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    costUsd: z.number(),
  })
  .readonly()

export type ModelTokenUsage = z.infer<typeof modelTokenUsageSchema>

/**
 * ターンの中の持ち場。メインループか、サブエージェント（Agent ツール）の中かの2つ。
 * SDK の `parent_tool_use_id` が非 null かどうかで決まる（`sdk.d.ts`: 「non-null when the message was produced inside a subagent」）。
 */
export type TurnUsageScope = "main" | "subagent"

/**
 * assistant 1ステップぶんの使用量（SDK の `assistant` メッセージの `message.usage`）。
 * ステップの usage に `thinkingTokens` と費用は乗らない（思考は出力に含まれ、費用は `result` 側だけが持つ）。
 */
const stepTokenUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
  })
  .readonly()

export type StepTokenUsage = z.infer<typeof stepTokenUsageSchema>

/**
 * ツール1種類ぶんの内訳。呼び出し1件ずつではなくツールの名前ごとに畳む（1ターンで数十件になるので、1件ずつ残すと行が読めなくなる）。
 * `resultBytes` は結果の長さの合計だけ（UTF-8 のバイト数）。結果の本文も引数も記録しない。
 */
const toolUsageCountSchema = z
  .object({
    /** ツールの名前（`Bash` / `Read` / `mcp__tsukumo__remember` など）。 */
    name: z.string(),
    /** そのターンに始まった呼び出しの回数（結果が返らなかったぶんも数える）。 */
    calls: z.number(),
    resultBytes: z.number(),
  })
  .readonly()

export type ToolUsageCount = z.infer<typeof toolUsageCountSchema>

/** 持ち場（{@link TurnUsageScope}）1つぶんの内訳。 */
const scopeUsageSchema = z
  .object({
    /** 数えた assistant のステップ数（同じ `message.id` は1つ）。 */
    steps: z.number(),
    /**
     * ステップの usage の合計（`message.id` ごとに最後の値だけを足したもの）。
     *
     * ターンの合計は {@link TokenUsageRecord.models} が正典で、これはその割り振りを見るための数。
     * 返答が流れている間の `usage` は確定値ではないので（`sdk.d.ts`）、実測では `outputTokens` が合計よりかなり小さく出る（下限として読む）。
     * どちらの持ち場が文脈を食ったかを見るには `inputTokens` と `cacheReadInputTokens` を使う（こちらは合計と近い値になる）。
     */
    tokens: stepTokenUsageSchema,
    /** ツールの名前ごとの内訳。結果の長さの大きい順（同じなら名前順）。 */
    tools: z.array(toolUsageCountSchema).readonly(),
  })
  .readonly()

export type ScopeUsage = z.infer<typeof scopeUsageSchema>

/**
 * そのターンの中を「何が文脈を膨らませたか」で割った内訳。
 * メインループとサブエージェントを同じ行の別立てにする（{@link TokenUsageRecord.models} はサブエージェントぶんも含むターンの合計なので、行を分けると合計と内訳が突き合わせられなくなる）。
 */
const turnUsageBreakdownSchema = z
  .object({ main: scopeUsageSchema, subagent: scopeUsageSchema })
  .readonly()

export type TurnUsageBreakdown = z.infer<typeof turnUsageBreakdownSchema>

/**
 * JSONL に書く1行の形。1行 = 1ターン（SDK の `result` 1つ。サブエージェントの中の `result` は数えない）で、モデルが複数出たターンは `models` に並ぶ。
 * 着手の印がある作業ツリーのターンだけ、タスクIDと段の名前（どちらも tw が決めた短い識別子で、会話の文面ではない）を持つ。
 * `v` が書く版と読める古い版のどちらでもない行は schema で落ちる。古い版の行は `taskId`・`stage` を持たないものとして読む。
 */
export const tokenUsageRecordSchema = z
  .object({
    v: z.literal([TOKEN_USAGE_FORMAT_VERSION, TOKEN_USAGE_LEGACY_FORMAT_VERSION]),
    /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
    at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
    /** claude 側のセッションID（`system/init` の `session_id`）。 */
    sessionId: z.string(),
    mode: z.enum(["work", "chat"]),
    /** 着手中のタスクのID（着手の印のファイル名）。印が無ければ無い。旧い版の行にも無い。 */
    taskId: z.string().optional(),
    /** 台帳の最新の `lap` の段の名前。タスクIDがあっても台帳に（当月と前月のどちらにも）そのタスクの lap が無い・読めなければ無い。 */
    stage: z.string().optional(),
    /**
     * 進みの差し込み（`progress-nudged`）で始まったターンだけが持つ。差し込み後に `speak` が出たら `spoke`、出なければ `silent`。
     * 差し込みの頻度はこの欄を持つ行の数で読む。旧い行・差し込みの無いターンには無い。
     */
    progressNudge: z.enum(["spoke", "silent"]).optional(),
    /**
     * メインの assistant メッセージのうち、描かれた `speak` だけを呼んだもの（同じメッセージに別のツールの呼び出しが並んでいない）の数。
     * `speak` を次のツールと同じ応答に並べていれば増えない。旧い行には無い。
     */
    speakOnlySteps: z.number().optional(),
    /** そのターンの増分。空の並びにはならない（増分が無いターンは行を書かない）。 */
    models: z.array(modelTokenUsageSchema).readonly(),
    /** ターンの中の内訳（合計の `models` を割ったもの）。 */
    breakdown: turnUsageBreakdownSchema,
  })
  .transform((row) => ({
    ...row,
    taskId: row.taskId,
    stage: row.stage,
    progressNudge: row.progressNudge,
    speakOnlySteps: row.speakOnlySteps,
  }))
  .readonly()

export type TokenUsageRecord = z.infer<typeof tokenUsageRecordSchema>
