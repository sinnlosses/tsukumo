// メインビューに残す質問の記録の器だけ（`<PresentationalQuestionRecord>`）。フックも算出も
// 持たず、`hooks/use-question-record.ts` が畳んだ値と呼び先をそのまま置く（docs/design.md 2章
// 「機能の中を分ける」）。
//
// 「何を聞いて、どう答えたか」を1つの塊で出す。選ばれた答えには印を付ける。自由入力の答えは
// 選択肢の並びの下に別の行として出す（`docs/display.md` 4.2「許可と質問」）。

import clsx from "clsx"
import { type ReactElement } from "react"

import { Heading } from "../../../../../../../components/ui/heading/heading.tsx"
import { Text } from "../../../../../../../components/ui/text/text.tsx"
import { Markdown } from "../../markdown/markdown.tsx"
import notationStyles from "../../markdown/report-notation.module.css"
import {
  type QuestionRecordAnswerRow,
  type QuestionRecordModel,
  type QuestionRecordPreviewRow,
  type QuestionRecordQuestionModel,
} from "./hooks/use-question-record.ts"
import styles from "./question-record.module.css"

const FREE_TEXT_SUFFIX = "（自由入力）"
const PREVIEWS_SUMMARY = "比べた内容"

export type PresentationalQuestionRecordProps = QuestionRecordModel

export function PresentationalQuestionRecord(
  props: PresentationalQuestionRecordProps,
): ReactElement {
  return (
    <section className={clsx(styles["tool-block"], styles["tool-block-question"])}>
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
      <Heading
        level={4}
        size="body"
        tone="inherit"
        weight="bold"
        className={styles["question-record-heading"] ?? ""}
      >
        {question.header}: {question.text}
      </Heading>
      <ul className={styles["question-options"]}>
        {question.answers.map((row) => (
          <AnswerRow row={row} multiSelect={question.multiSelect} key={row.key} />
        ))}
      </ul>
      {question.previews.length > 0 && (
        // 開くまで中身を描かない。一度開いたあとは閉じても外さない
        // （`hooks/use-question-record.ts`）。
        <details className={styles["question-previews"]} onToggle={question.onTogglePreviews}>
          <Text element="summary" size="secondary" tone="ink-quiet" weight="inherit" className="">
            {PREVIEWS_SUMMARY}
          </Text>
          {question.previewsOpened
            ? question.previews.map((preview) => (
                <PreviewBlock
                  preview={preview}
                  multiSelect={question.multiSelect}
                  key={preview.label}
                />
              ))
            : null}
        </details>
      )}
    </div>
  )
}

function AnswerRow(props: {
  readonly row: QuestionRecordAnswerRow
  readonly multiSelect: boolean
}): ReactElement {
  const { row, multiSelect } = props

  return (
    <li
      className={clsx(
        styles["question-option"],
        row.chosen && styles["is-chosen"],
        row.isFreeText && styles["is-free-text"],
      )}
    >
      <QuestionMark chosen={row.chosen} multiSelect={multiSelect} /> {row.label}
      {row.isFreeText ? FREE_TEXT_SUFFIX : null}
    </li>
  )
}

function PreviewBlock(props: {
  readonly preview: QuestionRecordPreviewRow
  readonly multiSelect: boolean
}): ReactElement {
  const { preview, multiSelect } = props

  return (
    // レポートと同じ見た目の語彙（`.detail-block` の子のセレクタ。
    // `markdown/report-notation.module.css`）に乗せる。
    <div className={notationStyles["detail-block"]}>
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="semibold"
        className={styles["question-preview-label"] ?? ""}
      >
        <QuestionMark chosen={preview.chosen} multiSelect={multiSelect} /> {preview.label}
      </Text>
      <Markdown text={preview.preview} />
    </div>
  )
}

/**
 * 選んだ印（単一選択は `●`/`○`、複数選択は `■`/`□`）を包む要素。文字そのものは常に DOM に
 * 残す（`::before` に移すと支援技術とコピーで拾えなくなるため）。色は文字の上への重ねがけで
 * 付け、選んだ側（`chosen`）だけに `accent` を当てる。選ばなかった側は親の `.question-option` の
 * 色をそのまま継ぎ、素の `accent` を当てない（`docs/screen-design.md` 13.1 原則1が許すのは
 * 「選んだ選択肢」で、選ばなかった側ではない）。答え待ちの札
 * （`question-ask.module.css` の `.question-ask-option.is-selected`）と同じ、
 * 「選んだ＝accent」という意味を記録の側にも揃える。折りたたみの中の preview の札
 * （`question-preview-label`）も同じ印を使うので、ここで共有する。形の違い（丸か四角か）が
 * 単一選択か複数選択かを運び、色は選んだかどうかだけを運ぶ（2つの意味を1つの見た目要素に
 * 重ねない）。
 */
function QuestionMark(props: {
  readonly chosen: boolean
  readonly multiSelect: boolean
}): ReactElement {
  const mark = props.multiSelect ? (props.chosen ? "■" : "□") : props.chosen ? "●" : "○"
  return (
    <Text
      element="span"
      size="inherit"
      tone={props.chosen ? "accent" : "inherit"}
      weight="inherit"
      className=""
    >
      {mark}
    </Text>
  )
}
