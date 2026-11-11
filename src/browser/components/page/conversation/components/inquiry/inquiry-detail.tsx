// お伺いの、フォーカスした選択肢の詳細。札と広げた板が同じ部品で描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { ReportImageSource } from "../../../../../../shared/report/report-image-markdown.ts"
import type {
  QuestionBriefCertainty,
  QuestionBriefFactBasis,
} from "../../../../../../shared/session-driver/question-brief.ts"
import {
  detailBlockClassName,
  Markdown,
  QuestionPreviewMarkdown,
} from "../../../../../features/report/markdown.tsx"
import { reportSectionsMarkdown } from "../../../../../features/report/report-markdown.ts"
import { Badge } from "../../../../ui/badge/badge.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import type {
  InquiryBrief as InquiryBriefModel,
  InquiryOptionRow,
} from "../../stores/inquiry-answer.ts"
import styles from "./inquiry.module.css"

export type ShelvedSource = Extract<ReportImageSource, { readonly kind: "shelved" }>

const DETAIL_SUFFIX = " の詳細"
const DETAIL_HINT = "選択肢を押すと詳細が出ます"
const RECOMMENDED_BADGE = "おすすめ"
const IRREVERSIBLE_BADGE = "⚠ 戻せない"
const WHY_ASK_LABEL = "聞く理由"
const FACTS_LABEL = "事実"
const RECOMMENDED_LABEL = "おすすめの理由"
const BASIS_LABEL = {
  checked: "確かめた",
  copied: "写した",
} satisfies Record<QuestionBriefFactBasis, string>
const BASIS_TONE = { checked: "ok", copied: "neutral" } satisfies Record<
  QuestionBriefFactBasis,
  "ok" | "neutral"
>
const CERTAINTY_LABEL = {
  high: "確度 高",
  medium: "確度 中",
  low: "確度 低",
} satisfies Record<QuestionBriefCertainty, string>
const CERTAINTY_TONE = { high: "ok", medium: "neutral", low: "warn" } satisfies Record<
  QuestionBriefCertainty,
  "ok" | "neutral" | "warn"
>

/** 出どころと確度は印の字で読めるようにし、色だけで分けない。 */
export function InquiryBrief(props: { readonly brief: InquiryBriefModel }): ReactElement {
  const { whyAsk, facts, recommended } = props.brief

  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="sm"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className={styles["inquiry-brief"]}
    >
      <Text
        element="p"
        size="secondary"
        tone="inherit"
        weight="inherit"
        className={styles["inquiry-brief-line"]}
      >
        <BriefLabel text={WHY_ASK_LABEL} /> {whyAsk}
      </Text>
      <VStack
        element="div"
        name={{ kind: "none" }}
        gap="xs"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <BriefLabel text={FACTS_LABEL} />
        <ul className={styles["inquiry-facts"]}>
          {facts.map((fact) => (
            <li className={styles["inquiry-fact"]} key={`${fact.basis}-${fact.text}`}>
              <Badge
                tone={BASIS_TONE[fact.basis]}
                shape="square"
                className={styles["inquiry-fact-basis"]}
              >
                {BASIS_LABEL[fact.basis]}
              </Badge>
              <Text
                element="span"
                size="secondary"
                tone="inherit"
                weight="inherit"
                className={styles["inquiry-fact-text"]}
              >
                {fact.text}
              </Text>
            </li>
          ))}
        </ul>
      </VStack>
      {recommended !== undefined && (
        <Text
          element="p"
          size="secondary"
          tone="inherit"
          weight="inherit"
          className={styles["inquiry-brief-line"]}
        >
          <BriefLabel text={RECOMMENDED_LABEL} />{" "}
          <Badge
            tone={CERTAINTY_TONE[recommended.certainty]}
            shape="square"
            className={styles["inquiry-brief-certainty"]}
          >
            {CERTAINTY_LABEL[recommended.certainty]}
          </Badge>{" "}
          {recommended.reason}
        </Text>
      )}
    </VStack>
  )
}

/** 詳細の欄に出すものがあるか（図か `preview`。`description` は選択肢の行に出す）。 */
export function hasDetail(option: InquiryOptionRow): boolean {
  return option.preview !== undefined || option.figures.length > 0
}

/** 選択肢の行の中身（番号・印・ラベル・バッジ）。操作できる行と読み専用の行が同じ見た目になるよう共用する。 */
export function InquiryOptionContent(props: {
  readonly option: InquiryOptionRow
  readonly mark?: ReactElement
}): ReactElement {
  const { option } = props

  return (
    <>
      <span className={styles["inquiry-option-number"]} aria-hidden="true">
        {option.number}
      </span>
      {props.mark}
      <Text
        element="span"
        size="inherit"
        tone="inherit"
        weight="bold"
        className={styles["inquiry-option-label"]}
      >
        {option.text}
      </Text>
      {option.recommended && (
        <Text
          element="span"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={styles["inquiry-option-badge"]}
        >
          {RECOMMENDED_BADGE}
        </Text>
      )}
      {option.irreversible && (
        <Text
          element="span"
          size="label"
          tone="state-ng"
          weight="bold"
          className={styles["inquiry-badge"]}
        >
          {IRREVERSIBLE_BADGE}
        </Text>
      )}
    </>
  )
}

export function InquiryOptionDescription(props: {
  readonly option: InquiryOptionRow
}): ReactElement {
  return (
    <>
      {props.option.description !== "" && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["inquiry-option-description"]}
        >
          {props.option.description}
        </Text>
      )}
    </>
  )
}

export function InquiryOptionList(props: {
  readonly options: readonly InquiryOptionRow[]
}): ReactElement {
  return (
    <ul className={styles["inquiry-options"]}>
      {props.options.map((option) => (
        <li className={styles["inquiry-option"]} key={option.label}>
          <HStack
            element="div"
            name={{ kind: "none" }}
            gap="sm"
            align="baseline"
            justify="start"
            wrap="nowrap"
            className={styles["inquiry-option-choose-static"]}
          >
            <InquiryOptionContent option={option} />
          </HStack>
          <InquiryOptionDescription option={option} />
        </li>
      ))}
    </ul>
  )
}

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

function BriefLabel(props: { readonly text: string }): ReactElement {
  return (
    <Text element="span" size="label" tone="ink-quiet" weight="bold" className="">
      {props.text}
    </Text>
  )
}
