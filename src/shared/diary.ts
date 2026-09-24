// 日記（`docs/glossary.md`「日記」）の型と、保存の形の読み手。**サーバ（`src/server/adapter/
// diary.ts` が読み書きする JSON）とブラウザ（成果の画面・日記帳が読む `GET /achievement` の
// `diary` 区画）の両方が同じ型を見る**ので shared に置く。保存の形・置き場・書き足しの規則は
// `docs/design.md`「日記の受け取りと保存」が正典で、ここは型と読み取りだけを持つ。
//
// **運ぶのは日記の本文・しおり・表情・書いた時刻とパックだけ**（会話の文面そのものではない。
// `docs/coding-standards.md`「会話内容の扱い」。日記はモデルが書いた成果物で、逐語の会話とは
// 別に扱う）。

import { z } from "zod"

/** 保存の形の版。読めた版はこれだけで、違えば「読めなかった」に倒す（読み手の {@link readDiary}）。 */
export const DIARY_VERSION = 1

/** 日記に挟む「この日のいちばん」（`docs/glossary.md`「しおり」）。終えたタスクが無い日は `none`。 */
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
  /** 書いた時刻（ローカル時刻のオフセット付き ISO。`src/server/adapter/local-time.ts` の `isoWithOffset`）。 */
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
 * 1日ぶんの成果の応答（`DailyAchievement.diary`）に載る、その日の日記の状態。**読めなくても
 * 「無い」と決めない**（`unreadable`。ファイルが壊れていても成果そのものは見える）。
 */
export type DailyDiaryStatus =
  | { readonly kind: "written"; readonly diary: Diary }
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }

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
  paragraphs: z.array(diaryParagraphSchema).min(1),
  bookmark: diaryBookmarkSchema,
})

export const dailyDiaryStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("written"), diary: diarySchema }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("unreadable") }),
])

/**
 * 届いた値を {@link Diary} として読む。**版が違う・形が崩れていれば `undefined`**
 * （`src/server/adapter/diary.ts` はこれを「読めない」として扱い、置き場のファイルの読み込みにも
 * `GET /achievement` の応答の検証にも同じ読み手を使う）。
 */
export function readDiary(value: unknown): Diary | undefined {
  const parsed = diarySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
