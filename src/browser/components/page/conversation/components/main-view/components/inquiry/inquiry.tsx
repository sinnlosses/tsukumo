// お伺いの札（答え待ちの許可要求と質問。メインビューの、いまのやり取りの進み具合の帯と依頼の塊の真下）。
// 頭に「お伺い」のチップ・種類・`header` かツール名・「n / N」と待っている時間、本文に問いの文か対象の全文と番号つきの選択肢、下端に操作の行を置く。
// 操作の行は札の下端に残り、本文と選択肢の側が札の内側で転がる。
//
// 数字キーと Enter が効くのは、札の中にフォーカスがあるときだけ。
//
// 選択の状態と進み方は `useInquiryAnswer` が持つ。
// 許可要求の入力と質問の本文は会話の内容そのものなので、ここから外へ出す経路は作らない。

import clsx from "clsx"
import type { KeyboardEvent, ReactElement } from "react"

import { truncateForDisplay } from "../../../../../../../features/current-work/domain/current-work-step.ts"
import {
  useInquiryAnswer,
  type InquiryModel,
  type InquiryOptionRow,
} from "../../../../../../../stores/inquiry-answer.ts"
import { useInquiryJump } from "../../../../../../../stores/inquiry-jump.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { useNowWhile } from "../../../hooks/use-now-while.ts"
import { QuestionPreviewMarkdown } from "../../markdown/deferred-markdown.tsx"
import notationStyles from "../../markdown/report-notation.module.css"
import { useInquiryScroll } from "./hooks/use-inquiry-scroll.ts"
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
/** 単一選択の radio をひとまとまりにする名前（札は1問ずつしか出ないので1つで足りる）。 */
const OPTION_GROUP_NAME = "inquiry-option"
/** 入力欄に書いて記録した答え（まだ送っていない問のぶん）の前置き。 */
const WRITTEN_ANSWER_PREFIX = "入力欄に書いた答え: "
/** 数字キーで選べる選択肢の数字。 */
const CHOICE_KEY = /^[1-9]$/

export function Inquiry(): ReactElement | null {
  const inquiry = useInquiryAnswer()
  const jump = useInquiryJump((state) => state.jump)
  const askId = inquiry.kind === "none" ? undefined : inquiry.id
  const cardRef = useInquiryScroll(askId, jump)
  const now = useNowWhile(inquiry.kind !== "none")

  if (inquiry.kind === "none") {
    return null
  }

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
      className={styles["inquiry"]}
      ref={cardRef}
      tabIndex={-1}
      aria-label={INQUIRY_CHIP}
      onKeyDown={onKeyDown}
    >
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
        <ul className={styles["inquiry-options"]}>
          {inquiry.options.map((option) => (
            <InquiryOption
              askId={inquiry.id}
              option={option}
              multiSelect={inquiry.multiSelect}
              onToggle={inquiry.onToggle}
              key={option.label}
            />
          ))}
        </ul>
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
    </section>
  )
}

/** 待っている時間を「0:42」の形にする（分は 60 を超えても繰り上げない）。 */
function waitedText(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * 選択肢1つぶんのカード。押す口は `<input>` と `<label>` の組（単一選択は radio、複数選択はチェックボックス）。
 * 説明と `preview` はその外に置く（`preview` は表や図になるので、`<label>` にも `<button>` にも入れられない）。
 */
function InquiryOption(props: {
  readonly askId: string
  readonly option: InquiryOptionRow
  readonly multiSelect: boolean
  readonly onToggle: (label: string) => void
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
      </HStack>
      {option.description !== "" && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["inquiry-option-description"]}
        >
          {option.description}
        </Text>
      )}
      {option.preview !== undefined && (
        // レポートと同じ見た目（report-notation.module.css の `.detail-block` の子のセレクタ）に乗せる。
        // `.inquiry-option .detail-block` の余白の打ち消し（inquiry.module.css）は、CSS Modules が class 名をファイルごとにハッシュ化するので、そちらの `.detail-block`（この選択子のためだけの空の再定義）も一緒に付ける。
        <div className={clsx(notationStyles["detail-block"], styles["detail-block"])}>
          <QuestionPreviewMarkdown text={option.preview} toolUseId={props.askId} />
        </div>
      )}
    </li>
  )
}
