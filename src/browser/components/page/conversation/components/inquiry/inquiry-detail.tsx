// お伺いの、フォーカスした選択肢の詳細と、軸 × 選択肢の比べる表。札と広げた板が同じ部品で描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { ReportImageSource } from "../../../../../../shared/report/report-image-markdown.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { reportSectionsMarkdown } from "../../domain/report-markdown.ts"
import type {
  InquiryBrief as InquiryBriefModel,
  InquiryOptionRow,
} from "../../stores/inquiry-answer.ts"
import { detailBlockClassName, Markdown, QuestionPreviewMarkdown } from "../markdown/markdown.tsx"
import styles from "./inquiry.module.css"

export type ShelvedSource = Extract<ReportImageSource, { readonly kind: "shelved" }>

const PROS_LABEL = "良い点"
const CONS_LABEL = "悪い点"
const DETAIL_SUFFIX = " の詳細"
const COMPARE_SUMMARY = "並べて比べる"
const DETAIL_HINT = "選択肢を押すと詳細が出ます"

/** フォーカスした選択肢の詳細のサーフェス。高さは切らず、札の本文が内側で転がる。 */
export function InquiryDetail(props: {
  readonly askId: string
  readonly imageSource: ShelvedSource
  readonly option: InquiryOptionRow
}): ReactElement {
  const { option } = props
  const figures =
    option.figures.length === 0
      ? ""
      : reportSectionsMarkdown([{ heading: "", blocks: option.figures }], props.imageSource)

  return (
    <div
      className={styles["inquiry-detail"]}
      role="group"
      aria-label={`${option.text}${DETAIL_SUFFIX}`}
    >
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="bold"
        className={styles["inquiry-detail-title"]}
      >
        {option.text}
        {DETAIL_SUFFIX}
      </Text>
      {option.description !== "" && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["inquiry-detail-description"]}
        >
          {option.description}
        </Text>
      )}
      <InquiryPoints label={PROS_LABEL} mark="＋" tone="state-ok" items={option.pros} />
      <InquiryPoints label={CONS_LABEL} mark="－" tone="state-ng" items={option.cons} />
      {option.preview !== undefined && (
        <div className={clsx(detailBlockClassName, styles["detail-block"])}>
          <QuestionPreviewMarkdown text={option.preview} toolUseId={props.askId} />
        </div>
      )}
      {figures !== "" && (
        <div className={clsx(detailBlockClassName, styles["detail-block"])}>
          <Markdown text={figures} />
        </div>
      )}
    </div>
  )
}

/** 何も触っていないあいだ、詳細の欄に出す案内の1行。 */
export function InquiryDetailHint(): ReactElement {
  return (
    <Text
      element="p"
      size="secondary"
      tone="ink-quiet"
      weight="inherit"
      className={styles["inquiry-detail-hint"]}
    >
      {DETAIL_HINT}
    </Text>
  )
}

export function InquiryCompare(props: {
  readonly open: boolean
  readonly imageSource: ShelvedSource
  readonly brief: InquiryBriefModel
  readonly options: readonly InquiryOptionRow[]
}): ReactElement {
  const table = reportSectionsMarkdown(
    [
      {
        heading: "",
        blocks: [
          {
            kind: "table",
            title: "",
            columns: ["", ...props.options.map((option) => option.text)],
            rows: props.brief.axes.map((axis, index) => [
              axis,
              ...props.options.map((option) => option.byAxis[index] ?? ""),
            ]),
            rest: "",
            fold: "",
            aside: "",
          },
        ],
      },
    ],
    props.imageSource,
  )

  return (
    <details className={styles["inquiry-compare"]} open={props.open}>
      <Text element="summary" size="secondary" tone="ink-quiet" weight="bold" className="">
        {COMPARE_SUMMARY}
      </Text>
      <div className={clsx(detailBlockClassName, styles["detail-block"])}>
        <Markdown text={table} />
      </div>
    </details>
  )
}

/** 良い点・悪い点の箇条書き。字の前の記号は色が見えなくても読める。 */
function InquiryPoints(props: {
  readonly label: string
  readonly mark: string
  readonly tone: "state-ok" | "state-ng"
  readonly items: readonly string[]
}): ReactElement | undefined {
  if (props.items.length === 0) {
    return undefined
  }
  return (
    <div className={styles["inquiry-points"]}>
      <Text element="p" size="label" tone={props.tone} weight="bold" className="">
        {props.label}
      </Text>
      <ul className={styles["inquiry-points-list"]}>
        {props.items.map((item) => (
          <li key={item}>
            <Text element="span" size="inherit" tone={props.tone} weight="bold" className="">
              {props.mark}
            </Text>{" "}
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
