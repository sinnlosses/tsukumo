import clsx from "clsx"
import type { ReactElement } from "react"

import type { InquiryModel, InquiryOptionRow } from "../../../../../stores/inquiry-answer.ts"
import { BottomSheet } from "../../../../ui/bottom-sheet/bottom-sheet.tsx"
import { InquiryCard } from "../main-view/main-view.tsx"
import type { PendingAskChips } from "./domain/pending-ask-chips.ts"
import styles from "./pending-ask-card.module.css"

const HEAD_LABEL = "？ 答え待ち"
const SUBJECT_SEPARATOR = "· "
const ANSWER_LABEL = "これで答える"
const NEXT_LABEL = "次へ"
const OMITTED_PREFIX = "ほか"
const DETAIL_LABEL = "詳しく"
const BRIEF_SHEET_LABEL = "お伺いの詳細"
const CHIPS_SHEET_LABEL = "対象の一覧"
const CHECK_MARK = "✓"
/** 2択は2列に並べる。 */
const TWO_COLUMN_COUNT = 2

/** 開いている板。どの答え待ちに対して開いたかを持ち、別の答え待ちに替われば閉じたものとして読む。 */
export type PendingAskSheet =
  | { readonly kind: "closed" }
  | { readonly kind: "brief" | "chips"; readonly askId: string }

type ActiveInquiry = Exclude<InquiryModel, { readonly kind: "none" }>

export function PresentationalPendingAskCard(props: {
  readonly inquiry: ActiveInquiry
  readonly chips: PendingAskChips
  readonly sheet: PendingAskSheet
  readonly onOpenSheet: (kind: "brief" | "chips") => void
  readonly onCloseSheet: () => void
}): ReactElement {
  const { inquiry, chips, sheet } = props
  const subject = inquiry.kind === "permission" ? inquiry.toolName : inquiry.header
  const question =
    inquiry.kind === "permission" ? `${inquiry.toolName} を実行してよい？` : inquiry.text
  const hasBrief = inquiry.kind === "question" && inquiry.brief !== undefined

  return (
    <>
      <section className={styles["pending-ask-card"]} aria-label="答え待ち">
        <div className={styles["pending-ask-card-scroll"]}>
          <header className={styles["pending-ask-card-head"]}>
            <HeadLead subject={subject} />
            <span className={styles["pending-ask-card-head-end"]}>
              {hasBrief && (
                <button
                  type="button"
                  className={styles["pending-ask-card-detail"]}
                  aria-haspopup="dialog"
                  onClick={() => {
                    props.onOpenSheet("brief")
                  }}
                >
                  {DETAIL_LABEL}
                </button>
              )}
              <Progress inquiry={inquiry} pushed={false} />
            </span>
          </header>
          <p className={styles["pending-ask-card-question"]}>{question}</p>
          {chips.shown.length > 0 && (
            <ul className={styles["pending-ask-card-chips"]} data-pending-ask-chips="">
              {chips.shown.map((chip) => (
                <li className={styles["pending-ask-card-chip"]} key={chip}>
                  {chip}
                </li>
              ))}
              {chips.omittedCount > 0 && (
                <li>
                  <button
                    type="button"
                    className={styles["pending-ask-card-omitted"]}
                    aria-haspopup="dialog"
                    onClick={() => {
                      props.onOpenSheet("chips")
                    }}
                  >
                    {OMITTED_PREFIX} {chips.omittedCount}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
        <div className={styles["pending-ask-card-actions"]}>
          <Answers inquiry={inquiry} />
        </div>
      </section>
      <BottomSheet
        open={sheet.kind !== "closed"}
        contentKey={`${sheet.kind}:${inquiry.id}`}
        ariaLabel={sheet.kind === "chips" ? CHIPS_SHEET_LABEL : BRIEF_SHEET_LABEL}
        onClose={props.onCloseSheet}
        header={
          <>
            <HeadLead subject={subject} />
            <Progress inquiry={inquiry} pushed />
          </>
        }
        footer={
          sheet.kind === "brief" && inquiry.kind === "question"
            ? {
                kind: "shown",
                node: (
                  <button
                    type="button"
                    className={clsx(
                      styles["pending-ask-card-button"],
                      styles["pending-ask-card-sheet-answer"],
                      styles["is-recommended"],
                    )}
                    aria-disabled={!inquiry.canAnswer}
                    onClick={inquiry.onAnswer}
                  >
                    {inquiry.last ? ANSWER_LABEL : NEXT_LABEL}
                  </button>
                ),
              }
            : { kind: "none" }
        }
      >
        {sheet.kind === "brief" && <InquiryCard actions="none" />}
        {sheet.kind === "chips" && (
          <ul className={styles["pending-ask-card-chips"]}>
            {chips.all.map((chip) => (
              <li className={styles["pending-ask-card-chip"]} key={chip}>
                {chip}
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </>
  )
}

/** 「？ 答え待ち · 題」。札の頭と板の頭で同じに書く。 */
function HeadLead(props: { readonly subject: string }): ReactElement {
  return (
    <>
      <span className={styles["pending-ask-card-label"]}>{HEAD_LABEL}</span>
      <span className={styles["pending-ask-card-subject"]}>
        {SUBJECT_SEPARATOR}
        {props.subject}
      </span>
    </>
  )
}

/** 2問以上のときだけ「n / N」を出す。 */
function Progress(props: {
  readonly inquiry: ActiveInquiry
  readonly pushed: boolean
}): ReactElement | null {
  if (props.inquiry.questionCount <= 1) {
    return null
  }
  return (
    <span
      className={clsx(styles["pending-ask-card-progress"], props.pushed && styles["is-pushed"])}
    >
      {props.inquiry.progressLabel}
    </span>
  )
}

function Answers(props: { readonly inquiry: ActiveInquiry }): ReactElement {
  const { inquiry } = props
  if (inquiry.kind === "permission") {
    // 選択肢は「許可」（番号 1）「拒否」の順で届く。表示は拒否が左で、塗るのは許可。
    return (
      <div className={clsx(styles["pending-ask-card-grid"], styles["is-two-columns"])}>
        {inquiry.options.toReversed().map((option) => (
          <ChooseButton
            option={{ ...option, recommended: option.number === 1 }}
            numbered={false}
            onChoose={inquiry.onChoose}
            key={option.label}
          />
        ))}
      </div>
    )
  }

  if (inquiry.multiSelect) {
    return (
      <div className={styles["pending-ask-card-grid"]}>
        {inquiry.options.map((option) => (
          <button
            type="button"
            className={clsx(
              styles["pending-ask-card-button"],
              option.selected && styles["is-selected"],
            )}
            aria-pressed={option.selected}
            onClick={() => {
              inquiry.onToggle(option.label)
            }}
            key={option.label}
          >
            <span className={styles["pending-ask-card-mark"]} aria-hidden="true">
              {option.selected ? CHECK_MARK : option.number}
            </span>
            <span className={styles["pending-ask-card-button-text"]}>{option.text}</span>
          </button>
        ))}
        <button
          type="button"
          className={clsx(styles["pending-ask-card-button"], styles["is-recommended"])}
          aria-disabled={!inquiry.canAnswer}
          onClick={inquiry.onAnswer}
        >
          {inquiry.last ? ANSWER_LABEL : NEXT_LABEL}
        </button>
      </div>
    )
  }

  const twoColumns = inquiry.options.length === TWO_COLUMN_COUNT
  return (
    <div className={clsx(styles["pending-ask-card-grid"], twoColumns && styles["is-two-columns"])}>
      {inquiry.options.map((option) => (
        <ChooseButton
          option={option}
          numbered={!twoColumns}
          onChoose={inquiry.onChoose}
          key={option.label}
        />
      ))}
    </div>
  )
}

/** 押した瞬間に答える1つのボタン。おすすめの印のある選択肢だけを塗る。 */
function ChooseButton(props: {
  readonly option: InquiryOptionRow
  readonly numbered: boolean
  readonly onChoose: (label: string) => void
}): ReactElement {
  const { option } = props
  return (
    <button
      type="button"
      className={clsx(
        styles["pending-ask-card-button"],
        option.recommended && styles["is-recommended"],
      )}
      onClick={() => {
        props.onChoose(option.label)
      }}
    >
      {props.numbered && (
        <span className={styles["pending-ask-card-mark"]} aria-hidden="true">
          {option.number}
        </span>
      )}
      <span className={styles["pending-ask-card-button-text"]}>{option.text}</span>
    </button>
  )
}
