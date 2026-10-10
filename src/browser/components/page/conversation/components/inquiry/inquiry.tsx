// お伺いの札（答え待ちの許可要求と質問。メインビューの、いまのやり取りの本文の末尾）。
// 頭に「お伺い」のチップ・種類・`header` かツール名・「n / N」と待っている時間、本文に問いの文か対象の全文・添え書きの背景と軸・左に選択肢の縦の並びと右にフォーカスした選択肢の詳細・畳める比較表、下端に操作の行を置く。
// 操作の行は札の下端に残り、本文と選択肢の側が札の内側で転がる。
//
// 数字キーと Enter が効くのは、札の中にフォーカスがあるときだけ。
//
// 選択の状態と進み方は `useInquiryAnswer` が持つ。
// 許可要求の入力と質問の本文は会話の内容そのものなので、ここから外へ出す経路は作らない。

import clsx from "clsx"
import type { KeyboardEvent, ReactElement } from "react"

import { reportSectionsMarkdown } from "../../../../../../shared/report/report-markdown.ts"
import { truncateForDisplay } from "../../../../../features/current-work/domain/current-work-step.ts"
import { useNowWhile } from "../../../../../hooks/use-now-while.ts"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import {
  useInquiryAnswer,
  type InquiryBrief as InquiryBriefModel,
  type InquiryModel,
  type InquiryOptionRow,
} from "../../../../../stores/inquiry-answer.ts"
import { useInquiryJump } from "../../../../../stores/inquiry-jump.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { detailBlockClassName, Markdown, QuestionPreviewMarkdown } from "../markdown/markdown.tsx"
import { useInquiryScroll } from "./hooks/use-inquiry-scroll.ts"
import { useInquiryVisibility } from "./hooks/use-inquiry-visibility.ts"
import styles from "./inquiry.module.css"

const INQUIRY_CHIP = "お伺い"
const KIND_LABEL = {
  permission: "許可",
  question: "質問",
} satisfies Record<Exclude<InquiryModel["kind"], "none">, string>
const BACK_LABEL = "戻る"
const FREE_TEXT_HINT = "選択肢にない答えは、下の入力欄に書いて送れます"
const RECOMMENDED_BADGE = "おすすめ"
const ANSWER_LABEL = "これで答える"
const NEXT_LABEL = "次へ"
/** 押せる口に添えるキーの字。 */
const ENTER_KEY_HINT = "⏎"
const WAITED_PREFIX = "待って"
const BACKGROUND_LABEL = "背景"
const AXES_LABEL = "判断の軸"
const AXES_SEPARATOR = " / "
const PROS_LABEL = "良い点"
const CONS_LABEL = "悪い点"
const IRREVERSIBLE_BADGE = "⚠ 戻せない"
const DETAIL_SUFFIX = " の詳細"
const COMPARE_SUMMARY = "並べて比べる"
/** 単一選択の radio をひとまとまりにする名前（札は1問ずつしか出ないので1つで足りる）。 */
const OPTION_GROUP_NAME = "inquiry-option"
/** 入力欄に書いて記録した答え（まだ送っていない問のぶん）の前置き。 */
const WRITTEN_ANSWER_PREFIX = "入力欄に書いた答え: "
/** 数字キーで選べる選択肢の数字。 */
const CHOICE_KEY = /^[1-9]$/

export function Inquiry(): ReactElement | null {
  const phone = usePhoneWidth()
  return phone ? null : <InquiryCard actions="inline" />
}

/** `actions` が `none` のときは操作の行を出さない（狭い画面の板が、下端に自前の口を置く）。 */
export function InquiryCard(props: { readonly actions: "inline" | "none" }): ReactElement | null {
  const inquiry = useInquiryAnswer()
  const jump = useInquiryJump((state) => state.jump)
  const askId = inquiry.kind === "none" ? undefined : inquiry.id
  const cardRef = useInquiryScroll(askId, jump)
  useInquiryVisibility(cardRef, askId !== undefined && props.actions === "inline")
  const now = useNowWhile(inquiry.kind !== "none")

  if (inquiry.kind === "none") {
    return null
  }

  const focused = inquiry.options.find((option) => option.label === inquiry.focusedLabel)

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    if (CHOICE_KEY.test(event.key)) {
      const option = inquiry.options.find((candidate) => String(candidate.number) === event.key)
      if (option !== undefined) {
        event.preventDefault()
        inquiry.onToggle(option.label)
      }
      return
    }
    if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      // 次の問へ進むと、フォーカスしていた選択肢は作り直されて外れる。札そのものへ預けて、続けてキーを受ける。
      cardRef.current?.focus({ preventScroll: true })
      inquiry.onAnswer()
    }
  }

  return (
    <section
      className={clsx(styles["inquiry"], props.actions === "none" && styles["is-bare"])}
      ref={cardRef}
      tabIndex={-1}
      aria-label={INQUIRY_CHIP}
      onKeyDown={onKeyDown}
    >
      {props.actions === "inline" && (
        <HStack
          element="header"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="center"
          justify="start"
          wrap="wrap"
          className={styles["inquiry-head"]}
        >
          <span className={styles["inquiry-chip"]}>{INQUIRY_CHIP}</span>
          <Text
            element="span"
            size="secondary"
            tone="state-warn"
            weight="bold"
            className={styles["inquiry-kind"]}
          >
            {KIND_LABEL[inquiry.kind]}
          </Text>
          {inquiry.kind === "permission" && (
            <Text
              element="span"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["inquiry-tool"]}
            >
              {inquiry.toolName}
            </Text>
          )}
          {inquiry.kind === "question" && (
            <Text
              element="span"
              size="secondary"
              tone="ink-quiet"
              weight="inherit"
              className={styles["inquiry-subject"]}
            >
              {inquiry.header}
            </Text>
          )}
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["inquiry-progress"]}
          >
            {inquiry.progressLabel} · {WAITED_PREFIX} {waitedText(now - inquiry.askedAt)}
          </Text>
        </HStack>
      )}
      <div className={styles["inquiry-body"]}>
        {inquiry.kind === "question" && (
          <Text
            element="p"
            size="inherit"
            tone="inherit"
            weight="bold"
            className={styles["inquiry-text"]}
          >
            {inquiry.text}
          </Text>
        )}
        {inquiry.kind === "permission" && inquiry.targetText !== "" && (
          <pre className={styles["inquiry-target"]}>{truncateForDisplay(inquiry.targetText)}</pre>
        )}
        {inquiry.kind === "question" && inquiry.brief !== undefined && (
          <InquiryBrief brief={inquiry.brief} />
        )}
        <div className={styles["inquiry-choose"]}>
          <ul className={styles["inquiry-options"]}>
            {inquiry.options.map((option) => (
              <InquiryOption
                option={option}
                multiSelect={inquiry.multiSelect}
                onToggle={inquiry.onToggle}
                onFocus={inquiry.onFocus}
                key={option.label}
              />
            ))}
          </ul>
          {focused !== undefined && hasDetail(focused) && (
            <InquiryDetail askId={inquiry.id} option={focused} />
          )}
        </div>
        {inquiry.kind === "question" &&
          inquiry.brief !== undefined &&
          inquiry.brief.axes.length > 0 && (
            <InquiryCompare askId={inquiry.id} brief={inquiry.brief} options={inquiry.options} />
          )}
        {inquiry.kind === "question" && inquiry.writtenAnswer !== "" && (
          <Text
            element="p"
            size="secondary"
            tone="state-warn"
            weight="inherit"
            className={styles["inquiry-written"]}
          >
            {WRITTEN_ANSWER_PREFIX}
            {inquiry.writtenAnswer}
          </Text>
        )}
      </div>
      {props.actions === "inline" && (
        <HStack
          element="footer"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="center"
          justify="end"
          wrap="wrap"
          className={styles["inquiry-foot"]}
        >
          {inquiry.kind === "question" && (
            <Text
              element="span"
              size="label"
              tone="ink-quiet"
              weight="inherit"
              className={styles["inquiry-hint"]}
            >
              {FREE_TEXT_HINT}
            </Text>
          )}
          {inquiry.showBack && (
            <Button
              variant="outline-hover-warn"
              size="secondary"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["inquiry-back"]}
              onClick={inquiry.onBack}
            >
              {BACK_LABEL}
            </Button>
          )}
          <Button
            variant="solid-warn"
            size="secondary"
            pressed="none"
            disabled={!inquiry.canAnswer}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["inquiry-answer"]}
            onClick={inquiry.onAnswer}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              {inquiry.last ? ANSWER_LABEL : NEXT_LABEL}
            </Text>
            <span className={styles["inquiry-key"]} aria-hidden="true">
              {ENTER_KEY_HINT}
            </span>
          </Button>
        </HStack>
      )}
    </section>
  )
}

/** 待っている時間を「0:42」の形にする（分は 60 を超えても繰り上げない）。 */
function waitedText(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)}:${String(seconds % 60).padStart(2, "0")}`
}

function InquiryBrief(props: { readonly brief: InquiryBriefModel }): ReactElement {
  return (
    <div className={styles["inquiry-brief"]}>
      <Text
        element="p"
        size="secondary"
        tone="inherit"
        weight="inherit"
        className={styles["inquiry-brief-line"]}
      >
        <Text element="span" size="label" tone="ink-quiet" weight="bold" className="">
          {BACKGROUND_LABEL}
        </Text>{" "}
        {props.brief.background}
      </Text>
      {props.brief.axes.length > 0 && (
        <Text
          element="p"
          size="secondary"
          tone="inherit"
          weight="inherit"
          className={styles["inquiry-brief-line"]}
        >
          <Text element="span" size="label" tone="ink-quiet" weight="bold" className="">
            {AXES_LABEL}
          </Text>{" "}
          {props.brief.axes.join(AXES_SEPARATOR)}
        </Text>
      )}
    </div>
  )
}

/** 詳細の面に出すものがあるか（許可の「許可」「拒否」には無い）。 */
function hasDetail(option: InquiryOptionRow): boolean {
  return (
    option.description !== "" ||
    option.preview !== undefined ||
    option.pros.length > 0 ||
    option.cons.length > 0 ||
    option.figures.length > 0
  )
}

/** フォーカスした選択肢の詳細の面。高さは切らず、札の本文が内側で転がる。 */
function InquiryDetail(props: {
  readonly askId: string
  readonly option: InquiryOptionRow
}): ReactElement {
  const { option } = props
  const figures =
    option.figures.length === 0
      ? ""
      : reportSectionsMarkdown([{ heading: "", blocks: option.figures }], {
          kind: "shelved",
          toolUseId: props.askId,
        })

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

/** 良い点・悪い点の箇条書き。字の前の記号は色が見えなくても読める。 */
function InquiryPoints(props: {
  readonly label: string
  readonly mark: string
  readonly tone: "state-ok" | "state-ng"
  readonly items: readonly string[]
}): ReactElement | null {
  if (props.items.length === 0) {
    return null
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

function InquiryCompare(props: {
  readonly askId: string
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
            fold: "",
          },
        ],
      },
    ],
    { kind: "shelved", toolUseId: props.askId },
  )

  return (
    <details className={styles["inquiry-compare"]}>
      <Text element="summary" size="secondary" tone="ink-quiet" weight="bold" className="">
        {COMPARE_SUMMARY}
      </Text>
      <div className={clsx(detailBlockClassName, styles["detail-block"])}>
        <Markdown text={table} />
      </div>
    </details>
  )
}

/** 選択肢1つぶんの行。押す口は `<input>` と `<label>` の組（単一選択は radio、複数選択はチェックボックス）。 */
function InquiryOption(props: {
  readonly option: InquiryOptionRow
  readonly multiSelect: boolean
  readonly onToggle: (label: string) => void
  readonly onFocus: (label: string) => void
}): ReactElement {
  const { option } = props

  return (
    <li className={clsx(styles["inquiry-option"], option.selected && styles["is-selected"])}>
      <HStack
        element="label"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="baseline"
        justify="start"
        wrap="nowrap"
        className={styles["inquiry-option-choose"]}
      >
        <span className={styles["inquiry-option-number"]} aria-hidden="true">
          {option.number}
        </span>
        <input
          type={props.multiSelect ? "checkbox" : "radio"}
          name={props.multiSelect ? undefined : OPTION_GROUP_NAME}
          className={styles["inquiry-option-mark"]}
          checked={option.selected}
          onChange={() => props.onToggle(option.label)}
          onFocus={() => props.onFocus(option.label)}
        />
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
      </HStack>
    </li>
  )
}
