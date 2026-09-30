// 日記の型と、保存の形の読み手。置き場と書き方は `appendDiaryParagraph` が持ち、ここは型と読み取りだけを持つ。
// 運ぶのは日記の本文・しおり・表情・書いた時刻とパックだけ（日記はモデルが書いた成果物で、逐語の会話とは別に扱う）。

import { z } from "zod"

/** 保存の形の版。読めた版はこれだけで、違えば「読めなかった」に倒す（読み手の {@link readDiary}）。 */
export const DIARY_VERSION = 1

/** 日記に挟む「この日のいちばん」。終えたタスクが無い日は `none`。 */
export type DiaryBookmark =
  | { readonly kind: "none" }
  | {
      readonly kind: "placed"
      readonly taskId: string
      /** 選んだ時点のタスクの要約。あとでタスクファイルが消えても見開きで読めるよう、写しを持つ。 */
      readonly summary: string
      readonly reason: string
    }

/** 日記の1段落（1回の振り返りぶん）。 */
export type DiaryParagraph = {
  /** 書いた時刻（ローカル時刻のオフセット付き ISO）。 */
  readonly writtenAt: string
  readonly body: string
  /** 書いたときの表情名。パックを替えても読めるよう、`speak` と同じ列挙ではなく文字列で持つ。 */
  readonly expression: string
  /** 書いたパック（ディレクトリ名と表示名）。あとでキャラクターを替えても誰が書いたかが残る。 */
  readonly writer: { readonly pack: string; readonly name: string }
}

/** ある1日ぶんの日記。同じ日に2回振り返ると段落が末尾に足され、しおりは新しいほうに差し替わる。 */
export type Diary = {
  readonly version: typeof DIARY_VERSION
  readonly date: string
  /** 書いた順。1つ以上。 */
  readonly paragraphs: readonly DiaryParagraph[]
  readonly bookmark: DiaryBookmark
}

/**
 * 1日ぶんの成果の応答（`DailyAchievement.diary`）に載る、その日の日記の状態。
 * 読めなくても「無い」と決めない（`unreadable`。ファイルが壊れていても成果そのものは見える）。
 */
export type DailyDiaryStatus =
  | { readonly kind: "written"; readonly diary: Diary }
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }

/** 振り返りの3段の並び。この並びが段の順で、いまの段より前は済、後は未着手と読む（段は戻らない）。 */
export const DIARY_STAGES = ["read", "write", "pick"] as const

export type DiaryStage = (typeof DIARY_STAGES)[number]

/**
 * 振り返りの進み（`SessionState.diaryWriting`）。
 *
 * - `idle`: ふだん。一度も振り返っていない
 * - `writing`: 振り返り中。`startedAt` はそのターンが始まった時刻、`stage` はいまの段
 * - `written`: 直前の振り返りが書き上がった。次の `diary-requested` まで持ち続ける
 * - `failed`: `writing` のままターンが終わった（成功・中断・失敗のどれでも）。`written` と同じく
 *   次の `diary-requested` まで持ち続ける
 */
export type DiaryWriting =
  | { readonly kind: "idle" }
  | {
      readonly kind: "writing"
      readonly date: string
      readonly startedAt: number
      readonly stage: DiaryStage
    }
  | { readonly kind: "written"; readonly date: string; readonly writtenAt: number }
  | { readonly kind: "failed"; readonly date: string }

const diaryBookmarkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("placed"),
    taskId: z.string(),
    summary: z.string(),
    reason: z.string(),
  }),
])

const diaryParagraphSchema = z.object({
  writtenAt: z.string(),
  body: z.string(),
  expression: z.string(),
  writer: z.object({ pack: z.string(), name: z.string() }),
})

const diarySchema = z.object({
  version: z.literal(DIARY_VERSION),
  date: z.string(),
  paragraphs: z.array(diaryParagraphSchema).min(1).readonly(),
  bookmark: diaryBookmarkSchema,
})

export const dailyDiaryStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("written"), diary: diarySchema }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("unreadable") }),
])

/** 届いた値を {@link Diary} として読む。版が違う・形が崩れていれば `undefined`。 */
export function readDiary(value: unknown): Diary | undefined {
  const parsed = diarySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** 振り返りの進み（{@link DiaryWriting}）を動かすイベント。 */
export type DiaryEvent =
  /**
   * `diary` ツールが振り返りの日記を1段落受け付けた（保存も済んだ。出し手はツールの handler で、検査を通して保存できたものだけ流す）。
   * `date` は振り返りの対象の日（`YYYY-MM-DD`）。
   */
  | { readonly kind: "diary-written"; readonly date: string }
  /**
   * 成果の画面から振り返りを頼まれた（`session.reflectAchievement` コマンド）。
   * その日の成果を数え直し、書き手にその日ぶんを渡した直後に流す。会話とは別の使い捨ての問い合わせなので、会話の `prompt` は通らない。
   * `date` は振り返りの対象の日（`YYYY-MM-DD`）。段は「この日のタスクを読む」（`read`）。
   */
  | { readonly kind: "diary-requested"; readonly date: string }
  /**
   * 会話とは別の使い捨ての問い合わせの `includePartialMessages` の断片で、`diary` の呼び出しの塊が開いた（成果の画面の進みの材料）。
   * 段は「日記を書く」（`write`）。
   */
  | { readonly kind: "diary-drafting"; readonly toolUseId: string }
  /**
   * 振り返りの段が進んだ。同じ塊の引数の断片（`input_json_delta`）に、最上位の鍵 `bookmark` が現れた回だけ流す。
   * 運ぶのは段だけで、引数の中身はイベントに載せない。
   */
  | { readonly kind: "diary-stage"; readonly stage: DiaryStage }
  /** 振り返りの使い捨ての問い合わせが `diary` を受け付けられずに終わった（時間切れ・失敗・中断のどれでも）。`date` は振り返りの対象の日。 */
  | { readonly kind: "diary-failed"; readonly date: string }

/** 振り返りのイベント1件を畳む。 */
export function applyDiaryEvent(
  writing: DiaryWriting,
  event: DiaryEvent,
  at: number,
): DiaryWriting {
  switch (event.kind) {
    case "diary-requested":
      return { kind: "writing", date: event.date, startedAt: at, stage: "read" }
    case "diary-drafting":
      return withDiaryStage(writing, "write")
    case "diary-stage":
      return withDiaryStage(writing, event.stage)
    case "diary-written":
      return { kind: "written", date: event.date, writtenAt: at }
    case "diary-failed":
      return { kind: "failed", date: event.date }
  }
}

/**
 * `diary-drafting` / `diary-stage` で段を進める。`writing` でなければ何もしない。
 * 段は戻らない（`DIARY_STAGES` の並びでいまの段より前へは動かさない）。
 */
function withDiaryStage(writing: DiaryWriting, stage: DiaryStage): DiaryWriting {
  if (writing.kind !== "writing") {
    return writing
  }
  return DIARY_STAGES.indexOf(stage) < DIARY_STAGES.indexOf(writing.stage)
    ? writing
    : { ...writing, stage }
}
