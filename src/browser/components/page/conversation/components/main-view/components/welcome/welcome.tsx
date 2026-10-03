// 迎える局面のメインビューの中身。見出しと、おすすめの札（押すとすぐ依頼が送られる）と、ほかの始め方を出す。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { codeSpanParts } from "../../../../../../../domain/code-span.ts"
import { TaskSummaryText } from "../../../../../../../features/task-board/components/task-summary-text.tsx"
import { CharacterFace } from "../../../../../../domain/character-face.tsx"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import {
  ArrowRightIcon,
  HistoryIcon,
  ListIcon,
  PencilIcon,
} from "../../../../../../ui/icon/icon.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import type { WelcomeCard } from "./domain/welcome-entries.ts"
import { useWelcome, type WelcomeModel } from "./hooks/use-welcome.ts"
import styles from "./welcome.module.css"

const TITLE = "何から始める？"
const LEAD_WITH_CARDS = "tsukumo のおすすめ。「始める」を押すと、すぐに頼んで作業が始まる。"
const LEAD_WITHOUT_CARDS = "下の入力欄から頼める。"
const TOP_BADGE = "いちばんのおすすめ"
const OTHERS_LABEL = "ほかの始め方"

export function Welcome(): ReactElement {
  const model = useWelcome()
  const hasCards = model.cards.length > 0

  return (
    <div className={styles["welcome"]}>
      <Heading level={2} size="heading" tone="ink" weight="bold" className={styles["title"]}>
        {TITLE}
      </Heading>
      <Text
        element="p"
        size="subheading"
        tone="ink-quiet"
        weight="inherit"
        className={styles["lead"]}
      >
        {hasCards ? LEAD_WITH_CARDS : LEAD_WITHOUT_CARDS}
      </Text>
      {hasCards && (
        <ul className={styles["cards"]} data-count={model.cards.length}>
          {model.cards.map((card, index) => (
            <li key={card.key} className={styles["card-item"]}>
              <Card card={card} index={index} model={model} />
            </li>
          ))}
        </ul>
      )}
      <Others model={model} primary={!hasCards} />
    </div>
  )
}

function Card(props: {
  readonly card: WelcomeCard
  readonly index: number
  readonly model: WelcomeModel
}): ReactElement {
  const { card, index, model } = props
  const top = index === 0

  return (
    <div className={clsx(styles["card"], top && styles["card-top"])}>
      <span className={styles["card-head"]}>
        <span className={styles["card-id"]}>{card.id}</span>
        {top && <span className={styles["card-badge"]}>{TOP_BADGE}</span>}
      </span>
      <span className={styles["card-title"]}>
        <TaskSummaryText parts={codeSpanParts(card.title)} />
      </span>
      {card.reason !== "" && (
        <span className={styles["card-reason"]}>
          <CharacterFace url={model.face.url} alt="" className={styles["card-face"]} />
          <span>{card.reason}</span>
        </span>
      )}
      <span className={styles["card-foot"]}>
        <kbd className={styles["card-key"]}>{index + 1}</kbd>
        <Button
          variant={top ? "solid-accent" : "outline"}
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={`${card.id} を始める（すぐ送る）`}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["card-start"]}
          onClick={() => {
            model.onStart(card.request)
          }}
        >
          始める
          <ArrowRightIcon />
        </Button>
      </span>
    </div>
  )
}

function Others(props: { readonly model: WelcomeModel; readonly primary: boolean }): ReactElement {
  const { model, primary } = props

  return (
    <div className={clsx(styles["others"], primary && styles["others-large"])}>
      {!primary && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["others-label"]}
        >
          {OTHERS_LABEL}
        </Text>
      )}
      <OtherButton primary={primary} onClick={model.onWrite}>
        <PencilIcon />
        自分で書く
        <kbd className={styles["card-key"]}>/</kbd>
      </OtherButton>
      <OtherButton primary={false} onClick={model.onPickTask}>
        <ListIcon />
        タスクの一覧から選ぶ
      </OtherButton>
      {model.hasPrevious && (
        <OtherButton primary={false} onClick={model.onSeePrevious}>
          <HistoryIcon />
          前のやり取りを見る
          <kbd className={styles["card-key"]}>←</kbd>
        </OtherButton>
      )}
    </div>
  )
}

function OtherButton(props: {
  readonly primary: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <Button
      variant={props.primary ? "outline-accent" : "outline"}
      size="subheading"
      pressed="none"
      disabled={false}
      ariaLabel={undefined}
      ariaHasPopup={undefined}
      disclosure={{ kind: "none" }}
      title={undefined}
      className={styles["other"]}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}
