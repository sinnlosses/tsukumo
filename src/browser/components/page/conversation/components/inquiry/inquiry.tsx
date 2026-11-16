// お伺いのカード（答え待ちの許可要求と質問。メインビューの、いまのやり取りの本文の末尾）。
// 頭に種類・`header` かツール名・待っている時間（2問以上のときは「n / N」を前に）・「広げる」、本文に問いの文か対象の全文・添え書きの塊（聞く理由・事実・おすすめの理由）・左に選択肢の縦の並びと右にフォーカスした選択肢の詳細、下端に操作の行を置く。
// 操作の行は札の下端に残り、本文と選択肢の側が札の内側で転がる。
//
// 数字キーと Enter が効くのは、札の中にフォーカスがあるときだけ。Esc は入力欄へフォーカスを戻す（広げた板が開いているあいだは板を閉じる Esc に譲る）。
//
// 選択の状態と進み方は `useInquiryAnswer` が持つ。
// 許可要求の入力と質問の本文は会話の内容そのものなので、ここから外へ出す経路は作らない。

import clsx from "clsx"
import { useRef, useState } from "react"
import type { KeyboardEvent, ReactElement } from "react"

import { formatMinutesSeconds } from "../../../../../../shared/utils/elapsed-time.ts"
import { truncateForDisplay } from "../../../../../features/current-work/current-work-step.ts"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useNowWhile } from "../../../../../stores/clock.ts"
import { returnFocusToComposerOnEscape } from "../../../../../stores/composer-focus.ts"
import { useFirstNoteList } from "../../../../../stores/first-note-seen.ts"
import { useInquiryJump } from "../../../../../stores/inquiry-jump.ts"
import { mergeRefs } from "../../../../../utils/merge-ref.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { ExpandButton } from "../../../../ui/expand-button/expand-button.tsx"
import { FirstNoteList } from "../../../../ui/first-note-list/first-note-list.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import {
  useInquiryAnswer,
  type InquiryModel,
  type InquiryOptionRow,
} from "../../stores/inquiry-answer.ts"
import { useInquiryScroll } from "./hooks/use-inquiry-scroll.ts"
import { useInquiryVisibility } from "./hooks/use-inquiry-visibility.ts"
import {
  hasDetail,
  InquiryBrief,
  InquiryDetail,
  InquiryDetailHint,
  InquiryOptionContent,
  InquiryOptionDescription,
  InquiryOptionList,
  type ShelvedSource,
} from "./inquiry-detail.tsx"
import styles from "./inquiry.module.css"

/** 札の `region` の名前。頭には字を出さない。 */
const REGION_LABEL = "お伺い"
const KIND_LABEL = {
  permission: "許可",
  question: "質問",
} satisfies Record<Exclude<InquiryModel["kind"], "none">, string>
const BACK_LABEL = "戻る"
const CONFIRM_LABEL = "これで確定する"
const CONFIRM_NOTE = "戻せない操作。⏎ だけでは確定しない"
const COLLAPSE_LABEL = "閉じる"
const BOARD_LABEL = "お伺い（広げた板）"
const WRITING_NOTE = "入力欄の答えで答えます"
const ANSWER_LABEL = "これで答える"
const NEXT_LABEL = "次へ"
/** ボタンに添えるキーの字。 */
const ENTER_KEY_HINT = "⏎"
const CONFIRM_KEY_HINT = "⇧⏎"
const WAITED_PREFIX = "待って"
/** 単一選択の radio をひとまとまりにする名前（札は1問ずつしか出ないので1つで足りる）。 */
const OPTION_GROUP_NAME = "inquiry-option"
/** 入力欄に書いて記録した答え（まだ送っていない問のぶん）の前置き。 */
const WRITTEN_ANSWER_PREFIX = "入力欄に書いた答え: "
/** 数字キーで選べる選択肢の数字。 */
const CHOICE_KEY = /^[1-9]$/

export { hasDetail, InquiryBrief, InquiryDetail, InquiryOptionList, type ShelvedSource }

export function Inquiry(): ReactElement | undefined {
  const phone = usePhoneWidth()
  return phone ? undefined : <InquiryCard actions="inline" />
}

/**
 * `actions` が `none` のときは操作の行を出さない（狭い画面の板が、下端に自前の口を置く）。
 * `inline` の札の頭には「広げる」を置き、押すと同じ中身を画面いっぱいの板に出す。
 * 札と板は同じ選択の状態を見る。
 */
export function InquiryCard(props: {
  readonly actions: "inline" | "none"
}): ReactElement | undefined {
  const inquiry = useInquiryAnswer()
  const jump = useInquiryJump((state) => state.jump)
  const [expanded, setExpanded] = useState(false)
  const askId = inquiry.kind === "none" ? undefined : inquiry.id
  const cardRef = useInquiryScroll(inquiry, jump)
  const boardRef = useRef<HTMLElement>(null)
  const visibilityRef = useInquiryVisibility(askId !== undefined && props.actions === "inline")
  const now = useNowWhile(inquiry.kind !== "none")

  if (inquiry.kind === "none") {
    return undefined
  }

  const closeBoard = (): void => setExpanded(false)
  const answerOnBoard = (): void => {
    inquiry.onAnswer()
    if (inquiry.last && inquiry.canAnswer) {
      closeBoard()
    }
  }
  const entrustOnBoard = (): void => {
    if (inquiry.kind !== "question") {
      return
    }
    inquiry.onEntrust()
    if (inquiry.last) {
      closeBoard()
    }
  }

  return (
    <>
      <section
        className={clsx(styles["inquiry"], props.actions === "none" && styles["is-bare"])}
        ref={mergeRefs(cardRef, visibilityRef)}
        tabIndex={-1}
        aria-label={REGION_LABEL}
        onKeyDown={(event) => {
          if (returnFocusToComposerOnEscape(event.nativeEvent)) {
            return
          }
          answerKey(event, inquiry, inquiry.onAnswer, () =>
            cardRef.current?.focus({ preventScroll: true }),
          )
        }}
      >
        <InquiryFace
          inquiry={inquiry}
          now={now}
          layout={props.actions === "inline" ? "card" : "sheet"}
          expand={
            props.actions === "inline"
              ? { kind: "open", onOpen: () => setExpanded(true) }
              : { kind: "none" }
          }
          onAnswer={inquiry.onAnswer}
          onEntrust={() => {
            if (inquiry.kind === "question") {
              inquiry.onEntrust()
            }
          }}
        />
      </section>
      {expanded && (
        <Dialog
          open={true}
          ariaLabel={BOARD_LABEL}
          backdrop="dim"
          placement={{ kind: "auto" }}
          onClose={closeBoard}
          className={styles["inquiry-board"]}
        >
          <section
            className={clsx(styles["inquiry"], styles["is-board"])}
            ref={boardRef}
            tabIndex={-1}
            aria-label={REGION_LABEL}
            onKeyDown={(event) =>
              answerKey(event, inquiry, answerOnBoard, () =>
                boardRef.current?.focus({ preventScroll: true }),
              )
            }
          >
            <InquiryFace
              inquiry={inquiry}
              now={now}
              layout="board"
              expand={{ kind: "close", onClose: closeBoard }}
              onAnswer={answerOnBoard}
              onEntrust={entrustOnBoard}
            />
          </section>
        </Dialog>
      )}
    </>
  )
}

type OpenInquiry = Exclude<InquiryModel, { readonly kind: "none" }>

type InquiryExpand =
  | { readonly kind: "none" }
  | { readonly kind: "open"; readonly onOpen: () => void }
  | { readonly kind: "close"; readonly onClose: () => void }

/** 数字キーで選び、Enter で答える。`holdFocus` は答える前にフォーカスを札（または板）へ預ける。 */
function answerKey(
  event: KeyboardEvent<HTMLElement>,
  inquiry: OpenInquiry,
  onAnswer: () => void,
  holdFocus: () => void,
): void {
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
    if (inquiry.confirm === "twice" && !event.shiftKey) {
      return
    }
    // 次の問へ進むと、フォーカスしていた選択肢は作り直されて外れる。札そのものへ預けて、続けてキーを受ける。
    holdFocus()
    onAnswer()
  }
}

/** 札・狭い画面の板・広げた板の中身。`sheet` は頭と操作の行を持たない。 */
function InquiryFace(props: {
  readonly inquiry: OpenInquiry
  readonly now: number
  readonly layout: "card" | "sheet" | "board"
  readonly expand: InquiryExpand
  readonly onAnswer: () => void
  readonly onEntrust: () => void
}): ReactElement {
  const { inquiry, now } = props
  const focusedLabel = inquiry.focusedLabel
  const focused =
    focusedLabel.kind === "option"
      ? inquiry.options.find((option) => option.label === focusedLabel.label)
      : undefined
  const untouched = focusedLabel.kind === "none"
  const detailed = inquiry.options.some(hasDetail)
  const hasTermMark =
    inquiry.kind === "question" &&
    inquiry.brief !== undefined &&
    (inquiry.brief.recommended !== undefined ||
      inquiry.brief.facts.some((fact) => fact.basis === "checked"))
  const firstNotes = useFirstNoteList(hasTermMark ? ["inquiry-terms"] : [])

  return (
    <>
      {props.layout !== "sheet" && (
        <HStack
          element="header"
          name={{ kind: "none" }}
          gap="sm"
          align="center"
          justify="start"
          wrap="wrap"
          className={styles["inquiry-head"]}
        >
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
          {inquiry.questionCount > 1 && (
            <Text
              element="span"
              size="label"
              tone="ink-quiet"
              weight="inherit"
              className={styles["inquiry-progress"]}
            >
              {inquiry.progressLabel}
            </Text>
          )}
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["inquiry-waited"]}
          >
            {WAITED_PREFIX} {waitedText(now - inquiry.askedAt)}
          </Text>
          {props.expand.kind === "open" && (
            <ExpandButton className={styles["inquiry-expand"]} onClick={props.expand.onOpen} />
          )}
          {props.expand.kind === "close" && (
            <Button
              variant="outline-hover-warn"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["inquiry-expand"]}
              onClick={props.expand.onClose}
            >
              {COLLAPSE_LABEL}
            </Button>
          )}
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
        {inquiry.kind === "question" && inquiry.writing && (
          <Text
            element="p"
            size="secondary"
            tone="state-warn"
            weight="bold"
            className={styles["inquiry-writing-note"]}
          >
            {WRITING_NOTE}
          </Text>
        )}
        <div className={clsx(styles["inquiry-choose"], detailed && styles["is-detailed"])}>
          <ul className={styles["inquiry-options"]}>
            {inquiry.options.map((option) => (
              <InquiryOption
                option={option}
                multiSelect={inquiry.multiSelect}
                dimmed={inquiry.kind === "question" && inquiry.writing}
                onToggle={inquiry.onToggle}
                onFocus={inquiry.onFocus}
                key={option.label}
              />
            ))}
          </ul>
          {focused !== undefined && hasDetail(focused) && (
            <InquiryDetail
              askId={inquiry.id}
              imageSource={imageSourceOf(inquiry)}
              option={focused}
            />
          )}
          {untouched && detailed && <InquiryDetailHint />}
        </div>
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
        <FirstNoteList {...firstNotes} />
      </div>
      {props.layout !== "sheet" && (
        <HStack
          element="footer"
          name={{ kind: "none" }}
          gap="sm"
          align="center"
          justify="end"
          wrap="wrap"
          className={styles["inquiry-foot"]}
        >
          {inquiry.showBack && (
            <Button
              variant="outline-hover-warn"
              size="secondary"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["inquiry-back"]}
              onClick={inquiry.onBack}
            >
              {BACK_LABEL}
            </Button>
          )}
          {inquiry.confirm === "twice" && (
            <Text
              element="span"
              size="secondary"
              tone="state-warn"
              weight="bold"
              className={styles["inquiry-confirm-note"]}
            >
              {CONFIRM_NOTE}
            </Text>
          )}
          {inquiry.kind === "question" && inquiry.entrust.kind === "offered" && (
            <Button
              variant="outline-hover-warn"
              size="secondary"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["inquiry-back"]}
              onClick={props.onEntrust}
            >
              {inquiry.entrust.label}
            </Button>
          )}
          <Button
            variant="solid-warn"
            size="secondary"
            pressed="none"
            disabled={!inquiry.canAnswer}
            disclosure={{ kind: "none" }}
            className={styles["inquiry-answer"]}
            onClick={props.onAnswer}
          >
            <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
              {inquiry.confirm === "twice"
                ? CONFIRM_LABEL
                : inquiry.last
                  ? ANSWER_LABEL
                  : NEXT_LABEL}
            </Text>
            <span className={styles["inquiry-key"]} aria-hidden="true">
              {inquiry.confirm === "twice" ? CONFIRM_KEY_HINT : ENTER_KEY_HINT}
            </span>
          </Button>
        </HStack>
      )}
    </>
  )
}

/** 待っている時間を「0:42」の形にする（分は 60 を超えても繰り上げない）。 */
function waitedText(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  return formatMinutesSeconds(seconds)
}

function imageSourceOf(inquiry: Exclude<InquiryModel, { readonly kind: "none" }>): ShelvedSource {
  return {
    kind: "shelved",
    toolUseId: inquiry.id,
    sizes: inquiry.kind === "question" ? inquiry.imageSizes : [],
    unshelved: inquiry.kind === "question" ? inquiry.unshelvedImages : [],
  }
}

/** 選択肢1つぶんの行。ボタンは `<input>` と `<label>` の組（単一選択は radio、複数選択はチェックボックス）。 */
function InquiryOption(props: {
  readonly option: InquiryOptionRow
  readonly multiSelect: boolean
  readonly dimmed: boolean
  readonly onToggle: (label: string) => void
  readonly onFocus: (label: string) => void
}): ReactElement {
  const { option } = props

  return (
    <li
      className={clsx(
        styles["inquiry-option"],
        option.selected && styles["is-selected"],
        props.dimmed && styles["is-dimmed"],
      )}
    >
      <HStack
        element="label"
        name={{ kind: "none" }}
        gap="sm"
        align="baseline"
        justify="start"
        wrap="nowrap"
        className={styles["inquiry-option-choose"]}
      >
        <InquiryOptionContent
          option={option}
          mark={
            <input
              type={props.multiSelect ? "checkbox" : "radio"}
              name={props.multiSelect ? undefined : OPTION_GROUP_NAME}
              className={styles["inquiry-option-mark"]}
              checked={option.selected}
              onChange={() => props.onToggle(option.label)}
              onFocus={() => props.onFocus(option.label)}
            />
          }
        />
      </HStack>
      <InquiryOptionDescription option={option} />
    </li>
  )
}
