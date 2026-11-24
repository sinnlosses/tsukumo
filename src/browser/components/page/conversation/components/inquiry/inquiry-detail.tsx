// お伺いの、フォーカスした選択肢の詳細。札と広げた板が同じ部品で描く。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { ReportImageSource } from "../../../../../../shared/report/report-image-markdown.ts"
import type {
  QuestionBriefCertainty,
  QuestionBriefFactBasis,
} from "../../../../../../shared/session-driver/question-brief.ts"
import { FIRST_NOTE_TEXT } from "../../../../../domain/first-note.ts"
import {
  detailBlockClassName,
  Markdown,
  QuestionPreviewMarkdown,
} from "../../../../../features/report/markdown.tsx"
import { reportSectionsMarkdown } from "../../../../../features/report/report-markdown.ts"
import { Badge } from "../../../../ui/badge/badge.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Surface } from "../../../../ui/surface/surface.tsx"
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
const CERTAINTY_LABEL = {
  high: "確度 高",
  medium: "確度 中",
  low: "確度 低",
} satisfies Record<QuestionBriefCertainty, string>
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
              <FactBasisMark basis={fact.basis} />
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
          <InquiryMark className={styles["inquiry-brief-certainty"]} explained>
            {CERTAINTY_LABEL[recommended.certainty]}
          </InquiryMark>{" "}
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
        <InquiryMark className={styles["inquiry-option-badge"]}>{RECOMMENDED_BADGE}</InquiryMark>
      )}
      {option.irreversible && (
        <Badge tone="ng" shape="square" className={styles["inquiry-badge"]}>
          {IRREVERSIBLE_BADGE}
        </Badge>
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
          <OptionFace>
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
          </OptionFace>
        </li>
      ))}
    </ul>
  )
}

/** 選択肢1つぶんの顔。置き方・状態の class は外側の `li` が持つ。 */
export function OptionFace(props: { readonly children: ReactNode }): ReactElement {
  return (
    <Surface
      element="div"
      tone="surface"
      space="none"
      radius="md"
      shadow="none"
      className={styles["inquiry-option-face"]}
    >
      {props.children}
    </Surface>
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
      <Surface
        element="div"
        tone="surface"
        space="none"
        radius="md"
        shadow="none"
        className={styles["inquiry-detail-face"]}
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
      </Surface>
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

/** 地を塗らない中立の印。`explained` のとき、初回の説明と同じ説明を持たせる。 */
function InquiryMark(props: {
  readonly className: string
  readonly children: string
  readonly explained?: boolean
}): ReactElement {
  const explanation = props.explained === true ? FIRST_NOTE_TEXT["inquiry-terms"] : undefined
  return (
    <span
      className={clsx(styles["inquiry-mark"], props.className)}
      title={explanation}
      aria-description={explanation}
    >
      {props.children}
    </span>
  )
}

function FactBasisMark(props: { readonly basis: QuestionBriefFactBasis }): ReactElement {
  return props.basis === "checked" ? (
    <span
      className={styles["inquiry-fact-basis"]}
      title={FIRST_NOTE_TEXT["inquiry-terms"]}
      aria-description={FIRST_NOTE_TEXT["inquiry-terms"]}
    >
      <Badge tone="ok" shape="square" className="">
        {BASIS_LABEL.checked}
      </Badge>
    </span>
  ) : (
    <InquiryMark className={styles["inquiry-fact-basis"]}>{BASIS_LABEL.copied}</InquiryMark>
  )
}

function BriefLabel(props: { readonly text: string }): ReactElement {
  return (
    <Text element="span" size="label" tone="ink-quiet" weight="bold" className="">
      {props.text}
    </Text>
  )
}
