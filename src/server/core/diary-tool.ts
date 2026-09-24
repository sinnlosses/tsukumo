// `diary` ツールまわりの決まりごと（docs/glossary.md「diary ツール」）。書けるのは成果の画面から
// 頼まれた振り返りのターンだけで、それ以外・形の外れた呼び出しは状態を変えずに断り、理由を
// 添えて呼び直させる（`report` / 見直しの2つと同じ線）。ツールを載せるのは
// `src/server/adapter/sdk-tool.ts`、保存は `src/server/adapter/diary.ts`、決定の理由は
// `docs/design.md`「日記の受け取りと保存」。
//
// **引数の形（文字列・列挙）は zod の形で SDK が先に検査する**（崩れていれば handler は
// 呼ばれない）。ここで見るのは形の外の条（いま書く日・1ターンに1回・本文やしおりの中身・
// 保存の失敗）だけ。**3段目の合図（引数の断片から `bookmark` を見つける純関数）はここには無い**
// （進みの表示は別の関心事）。

import { type DiaryBookmark } from "../../shared/diary.ts"
import { type Expression } from "../../shared/expression.ts"
import { type SessionEvent } from "../../shared/session-event.ts"

/** ツールの名前（docs/glossary.md「diary ツール」）。 */
export const DIARY_TOOL_NAME = "diary"

/** `body` の上限（仮。文字はコードポイントで数える）。 */
export const DIARY_BODY_MAX_CHARS = 600

/** `bookmark.reason` の上限（仮）。 */
export const DIARY_BOOKMARK_REASON_MAX_CHARS = 120

/** モデルに見せる `diary` の説明。**いつ呼ぶか・1ターンに1回・断られたら呼び直す**をここに書く。 */
export const DIARY_TOOL_DESCRIPTION =
  "その日の日記を書く。成果の画面から頼まれた振り返りのときだけ呼ぶ。1ターンに1回だけ。" +
  "受け付けられないときは理由が返るので、直して呼び直すこと。"

/** `bookmark` 引数の説明。 */
export const DIARY_BOOKMARK_DESCRIPTION =
  "この日のいちばん。依頼に並んだ終えたタスクから1件の id と、選んだ理由を1文で。" +
  "終えたタスクが無い日は省く。"

/** 依頼に並んだ、その日の終えたタスク1件（しおりの検査に使う）。 */
export type DiaryDayTask = { readonly id: string; readonly summary: string }

/**
 * いま書く日（`reflect-achievement` を受けたときに session-manager が窓口へ渡す。渡さなければ
 * `diary` は書けない）。ターンが終わると窓口は忘れる（{@link DiaryIntake.forgetDay}）。
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

/** 1段落を保存する口（実体は `src/server/adapter/diary.ts` の `appendDiaryParagraph`）。 */
export type SaveDiaryParagraph = (params: {
  readonly date: string
  readonly writtenAtEpochMilliseconds: number
  readonly body: string
  readonly expression: Expression
  readonly bookmark: DiaryBookmark
}) => Promise<boolean>

/** `diary` の handler が呼ぶ窓口。 */
export type DiaryIntake = {
  /** いま書く日を渡す（渡すのは session-manager）。渡すたびに「1ターンに1回」の印をリセットする。 */
  readonly beginDay: (day: DiaryDay) => void
  /** 書く日を忘れる（ターンが終わったとき）。次は新しい依頼を待つ。 */
  readonly forgetDay: () => void
  /** 受け付けるか決め、受け付けたら保存して `diary-written` を流す。 */
  readonly submit: (submission: DiarySubmission) => Promise<DiaryVerdict>
}

/**
 * {@link DiaryIntake} を1つ作る。`now` は書いた時刻（エポックミリ秒。時計を読むのは呼び出し側
 * = `src/server/adapter/sdk-driver.ts`）、`save` は保存の口、`onEvent` は駆動のイベントの流れ
 * （ここで例外を投げない）。
 */
export function createDiaryIntake(
  now: () => number,
  save: SaveDiaryParagraph,
  onEvent: (event: SessionEvent) => void,
): DiaryIntake {
  let day: DiaryDay | undefined
  // このターンで受け付けた日。`beginDay` を呼ぶたびにリセットする。
  let acceptedDate: string | undefined

  return {
    beginDay: (nextDay) => {
      day = nextDay
      acceptedDate = undefined
    },
    forgetDay: () => {
      day = undefined
      acceptedDate = undefined
    },
    submit: async (submission) => {
      const activeDay = day
      if (activeDay === undefined) {
        return { kind: "rejected", text: DIARY_NO_DAY_REASON }
      }
      if (acceptedDate === activeDay.date) {
        return { kind: "rejected", text: DIARY_ALREADY_WRITTEN_REASON }
      }

      const bodyViolation = diaryBodyViolation(submission.body)
      if (bodyViolation !== undefined) {
        return { kind: "rejected", text: bodyViolation }
      }

      const bookmark = diaryBookmarkOf(submission.bookmark, activeDay.doneTasks)
      if (bookmark.kind === "rejected") {
        return { kind: "rejected", text: bookmark.text }
      }

      const saved = await save({
        date: activeDay.date,
        writtenAtEpochMilliseconds: now(),
        body: submission.body,
        expression: submission.expression,
        bookmark: bookmark.bookmark,
      })
      if (!saved) {
        return { kind: "rejected", text: DIARY_SAVE_FAILED_REASON }
      }

      acceptedDate = activeDay.date
      onEvent({ kind: "diary-written", date: activeDay.date })
      return { kind: "accepted" }
    },
  }
}

const DIARY_NO_DAY_REASON =
  "日記は成果の画面から頼まれた振り返りのときだけ書ける。いまはそのターンではない。"

const DIARY_ALREADY_WRITTEN_REASON =
  "このターンではもう `diary` を受け付けている。1ターンに1回だけ。"

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
