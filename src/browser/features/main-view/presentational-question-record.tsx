// メインビューに残す**質問の記録**の器だけ（`<PresentationalQuestionRecord>`）。フックも算出も
// 持たず、`hooks/use-question-record.ts` が畳んだ値と呼び先をそのまま置く（docs/design.md 2章
// 「機能の中を分ける」）。
//
// 「何を聞いて、どう答えたか」を1つの塊で出す。選ばれた答えには印を付ける。**自由入力の答え**は
// 選択肢の並びの下に別の行として出す（`docs/requirements.md` 4.2「許可と質問」）。

import { type ReactElement } from "react"

import {
  type QuestionRecordAnswerRow,
  type QuestionRecordModel,
  type QuestionRecordPreviewRow,
  type QuestionRecordQuestionModel,
} from "./hooks/use-question-record.ts"
import { Markdown } from "./markdown/markdown.tsx"
import notationStyles from "./markdown/report-notation.module.css"
import styles from "./question-record.module.css"

const FREE_TEXT_SUFFIX = "（自由入力）"
const PREVIEWS_SUMMARY = "比べた内容"

export type PresentationalQuestionRecordProps = QuestionRecordModel

export function PresentationalQuestionRecord(
  props: PresentationalQuestionRecordProps,
): ReactElement {
  return (
    <section className={`${styles["tool-block"]} ${styles["tool-block-question"]}`}>
      {props.questions.map((question) => (
        <QuestionBlock question={question} key={question.key} />
      ))}
    </section>
  )
}

function QuestionBlock(props: { readonly question: QuestionRecordQuestionModel }): ReactElement {
  const { question } = props

  return (
    <div className={styles["question-record"]}>
      <h4>
        {question.header}: {question.text}
      </h4>
      <ul className={styles["question-options"]}>
        {question.answers.map((row) => (
          <AnswerRow row={row} key={row.key} />
        ))}
      </ul>
      {question.previews.length > 0 && (
        // 開くまで中身を描かない。一度開いたあとは閉じても外さない
        // （`hooks/use-question-record.ts`）。
        <details className={styles["question-previews"]} onToggle={question.onTogglePreviews}>
          <summary>{PREVIEWS_SUMMARY}</summary>
          {question.previewsOpened
            ? question.previews.map((preview) => (
                <PreviewBlock preview={preview} key={preview.label} />
              ))
            : null}
        </details>
      )}
    </div>
  )
}

function AnswerRow(props: { readonly row: QuestionRecordAnswerRow }): ReactElement {
  const { row } = props

  return (
    <li
      className={`${styles["question-option"]}${row.chosen ? ` ${styles["is-chosen"]}` : ""}${
        row.isFreeText ? ` ${styles["is-free-text"]}` : ""
      }`}
    >
      <QuestionMark chosen={row.chosen} /> {row.label}
      {row.isFreeText ? FREE_TEXT_SUFFIX : null}
    </li>
  )
}

function PreviewBlock(props: { readonly preview: QuestionRecordPreviewRow }): ReactElement {
  const { preview } = props

  return (
    // レポートと同じ見た目の語彙（`.detail-block` の子のセレクタ。
    // `markdown/report-notation.module.css`）に乗せる。
    <div className={notationStyles["detail-block"]}>
      <p className={styles["question-preview-label"]}>
        <QuestionMark chosen={preview.chosen} /> {preview.label}
      </p>
      <Markdown text={preview.preview} />
    </div>
  )
}

/**
 * 選んだ印（`●`/`○`）を包む要素。**文字そのものは常に DOM に残す**（`::before` に移すと
 * 支援技術とコピーで拾えなくなるため）。色は文字の上への重ねがけで付け、選んだ側
 * （`chosen`）だけに `accent` を当てる。選ばなかった `○` は親の `.question-option` の色を
 * そのまま継ぎ、素の `accent` を当てない（`docs/screen-design.md` 13.1 原則1が許すのは
 * 「選んだ選択肢」で、選ばなかった側ではない）。答え待ちの札
 * （`question-ask.module.css` の `.question-ask-option.is-selected`）と同じ、
 * 「選んだ＝accent」という意味を記録の側にも揃える。折りたたみの中の preview の札
 * （`question-preview-label`）も同じ印を使うので、ここで共有する。
 */
function QuestionMark(props: { readonly chosen: boolean }): ReactElement {
  return (
    <span className={`${styles["question-mark"]}${props.chosen ? ` ${styles["is-chosen"]}` : ""}`}>
      {props.chosen ? "●" : "○"}
    </span>
  )
}
