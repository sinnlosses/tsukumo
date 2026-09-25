// `diary` ツールまわりの決まりごと（docs/glossary.md「diary ツール」）。書けるのは会話とは別の
// 使い捨ての問い合わせ（`src/server/diary/adapter/sdk-diary.ts`）だけで、形の外れた呼び出しは
// 状態を変えずに断り、理由を添えて呼び直させる（`report` / 見直しの2つと同じ線）。保存は
// `src/server/diary/adapter/diary.ts`、決定の理由は `docs/design.md`「日記の受け取りと保存」。
//
// **引数の形（文字列・列挙）は zod の形で SDK が先に検査する**（崩れていれば handler は
// 呼ばれない）。ここで見るのは形の外の条（1問い合わせに1回・本文やしおりの中身・保存の失敗）だけ。
//
// **3段目の合図（引数の断片から最上位の鍵 `bookmark` を見つける純関数）もここに持つ**
// （`docs/design.md`「日記の受け取りと保存」「3段の進みの決まり方」）。断片をつないで観測する
// 状態機械は `sdk-diary.ts`（問い合わせ1回ぶんの持ち物なのでそちらに置く）。

import { type DiaryBookmark } from "../../../shared/diary.ts"
import { type Expression } from "../../../shared/expression.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"

/** ツールの名前（docs/glossary.md「diary ツール」）。 */
export const DIARY_TOOL_NAME = "diary"

/** `body` の上限（仮。文字はコードポイントで数える）。 */
export const DIARY_BODY_MAX_CHARS = 600

/** `bookmark.reason` の上限（仮）。 */
export const DIARY_BOOKMARK_REASON_MAX_CHARS = 120

/** モデルに見せる `diary` の説明。**いつ呼ぶか・1回だけ・断られたら呼び直す**をここに書く。 */
export const DIARY_TOOL_DESCRIPTION =
  "その日の日記を書く。1回だけ呼ぶ。受け付けられないときは理由が返るので、直して呼び直すこと。"

/** `bookmark` 引数の説明。 */
export const DIARY_BOOKMARK_DESCRIPTION =
  "この日のいちばん。依頼に並んだ終えたタスクから1件の id と、選んだ理由を1文で。" +
  "終えたタスクが無い日は省く。"

/** 依頼に並んだ、その日の終えたタスク1件（しおりの検査に使う）。 */
export type DiaryDayTask = { readonly id: string; readonly summary: string }

/**
 * 書く日（`session.reflectAchievement` を受けたときに session-manager が数え直した結果。窓口
 * （{@link createDiaryIntake}）は問い合わせ1回ごとにこれを受け取って作る）。
 */
export type DiaryDay = {
  readonly date: string
  readonly doneTasks: readonly DiaryDayTask[]
}

/** `diary` ツールに渡る引数（zod の形を通ったあと）。 */
export type DiarySubmission = {
  readonly body: string
  readonly expression: Expression
  /** 省略できる（終えたタスクが無い日だけ）。 */
  readonly bookmark: { readonly taskId: string; readonly reason: string } | undefined
}

/** handler の判定。`rejected` の `text` はそのまま `diary` の戻り値になる。 */
export type DiaryVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

/** 1段落を保存する口（実体は `src/server/diary/adapter/diary.ts` の `appendDiaryParagraph`）。 */
export type SaveDiaryParagraph = (params: {
  readonly date: string
  readonly writtenAtEpochMilliseconds: number
  readonly body: string
  readonly expression: Expression
  /** 書いたときのパック（ディレクトリ名と表示名）。窓口を作るときに1回だけ受け取る。 */
  readonly writer: { readonly pack: string; readonly name: string }
  readonly bookmark: DiaryBookmark
}) => Promise<boolean>

/** `diary` の handler が呼ぶ窓口。 */
export type DiaryIntake = {
  /** 受け付けるか決め、受け付けたら保存して `diary-written` を流す。 */
  readonly submit: (submission: DiarySubmission) => Promise<DiaryVerdict>
}

/**
 * {@link DiaryIntake} を1つ作る。**問い合わせ1回ごとに呼び出し側（`src/server/diary/core/diary-writer.ts`）が
 * 新しく作る**——窓口が「いま書く日」を覚えたり忘れたりしない。`day` は書く日、`writer` は
 * 書いた時点のパック、`now` は書いた時刻（エポックミリ秒）、`save` は保存の口、`onEvent` は
 * イベントの流れ（ここで例外を投げない）。
 */
export function createDiaryIntake(
  day: DiaryDay,
  writer: { readonly pack: string; readonly name: string },
  now: () => number,
  save: SaveDiaryParagraph,
  onEvent: (event: SessionEvent) => void,
): DiaryIntake {
  // この問い合わせで既に受け付けたか（1回だけ）。
  let accepted = false

  return {
    submit: async (submission) => {
      if (accepted) {
        return { kind: "rejected", text: DIARY_ALREADY_WRITTEN_REASON }
      }

      const bodyViolation = diaryBodyViolation(submission.body)
      if (bodyViolation !== undefined) {
        return { kind: "rejected", text: bodyViolation }
      }

      const bookmark = diaryBookmarkOf(submission.bookmark, day.doneTasks)
      if (bookmark.kind === "rejected") {
        return { kind: "rejected", text: bookmark.text }
      }

      const saved = await save({
        date: day.date,
        writtenAtEpochMilliseconds: now(),
        body: submission.body,
        expression: submission.expression,
        writer,
        bookmark: bookmark.bookmark,
      })
      if (!saved) {
        return { kind: "rejected", text: DIARY_SAVE_FAILED_REASON }
      }

      accepted = true
      onEvent({ kind: "diary-written", date: day.date })
      return { kind: "accepted" }
    },
  }
}

const DIARY_ALREADY_WRITTEN_REASON = "この問い合わせではもう `diary` を受け付けている。1回だけ。"

const DIARY_SAVE_FAILED_REASON = "いまは書けない。呼び直さなくてよい。"

function diaryBodyViolation(body: string): string | undefined {
  if (body.trim() === "") {
    return "`body` が空。空の本文は書けない。"
  }
  if ([...body].length > DIARY_BODY_MAX_CHARS) {
    return `\`body\` が長すぎる（${String(DIARY_BODY_MAX_CHARS)}文字まで）。短くして呼び直すこと。`
  }
  return undefined
}

type DiaryBookmarkOutcome =
  | { readonly kind: "resolved"; readonly bookmark: DiaryBookmark }
  | { readonly kind: "rejected"; readonly text: string }

/** `bookmark` 引数を検査し、通れば保存する形（{@link DiaryBookmark}）にする。 */
function diaryBookmarkOf(
  submitted: { readonly taskId: string; readonly reason: string } | undefined,
  doneTasks: readonly DiaryDayTask[],
): DiaryBookmarkOutcome {
  if (submitted === undefined) {
    return doneTasks.length === 0
      ? { kind: "resolved", bookmark: { kind: "none" } }
      : { kind: "rejected", text: "しおりに1件選ぶこと。`bookmark` が無い。" }
  }

  const task = doneTasks.find((candidate) => candidate.id === submitted.taskId)
  if (task === undefined) {
    const ids = doneTasks.map((candidate) => candidate.id).join("、")
    return {
      kind: "rejected",
      text: `\`bookmark.taskId\` がその日の終えたタスクに無い。選べる id: ${ids}`,
    }
  }

  if (submitted.reason.trim() === "") {
    return { kind: "rejected", text: "`bookmark.reason` が空。選んだ理由を1文で。" }
  }
  if ([...submitted.reason].length > DIARY_BOOKMARK_REASON_MAX_CHARS) {
    return {
      kind: "rejected",
      text: `\`bookmark.reason\` が長すぎる（${String(DIARY_BOOKMARK_REASON_MAX_CHARS)}文字まで）。`,
    }
  }

  return {
    kind: "resolved",
    bookmark: {
      kind: "placed",
      taskId: task.id,
      summary: task.summary,
      reason: submitted.reason,
    },
  }
}

/** `diary` の引数の最上位に現れる、しおりの鍵。 */
const DIARY_BOOKMARK_KEY = "bookmark"

/**
 * 引数の断片（累積した JSON の途中経過）の最上位に、しおりの鍵 `bookmark` が現れたかどうかを
 * 判定する純関数（`docs/design.md`「日記の受け取りと保存」「3段の進みの決まり方」）。文字列の
 * 中かどうかと入れ子の深さを数えながら読み、**閉じていない断片でも渡し直せば拾える**——
 * 鍵の名前が断片の切れ目をまたいでいても、累積したものを毎回渡し直す前提で作ってある。
 */
export function diaryArgumentHasBookmarkKey(accumulatedPartialJson: string): boolean {
  let depth = 0
  let inString = false
  let escaped = false
  let keyStart: number | undefined

  const text = accumulatedPartialJson
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
        if (
          depth === 1 &&
          keyStart !== undefined &&
          text.slice(keyStart, i) === DIARY_BOOKMARK_KEY
        ) {
          // 閉じた文字列が最上位の `bookmark` なら、続く `:`（間の空白は読み飛ばす）を確かめる。
          let cursor = i + 1
          while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
            cursor += 1
          }
          if (text[cursor] === ":") {
            return true
          }
        }
      }
      continue
    }
    if (char === '"') {
      inString = true
      keyStart = i + 1
    } else if (char === "{" || char === "[") {
      depth += 1
    } else if (char === "}" || char === "]") {
      depth -= 1
    }
  }
  return false
}
