// 迎える局面のメインビューの中身。見出しと、おすすめのカード（押すとすぐ依頼が送られる）を出す。

import clsx from "clsx"
import type { ReactElement } from "react"

import { codeSpanParts } from "../../../../../domain/code-span.ts"
import { TaskSummaryText } from "../../../../../features/task-board/task-summary-text.tsx"
import { CharacterFace } from "../../../../frame/character-face.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { ArrowRightIcon } from "../../../../ui/icon/icon.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { WelcomeCard } from "../../domain/welcome-entry-list.ts"
import { useWelcome, type WelcomeModel } from "./hooks/use-welcome.ts"
import styles from "./main-view.module.css"

const TITLE = "何から始める？"
const LEAD_WITH_CARDS =
  "tsukumo のおすすめ。「始める」を押すと、カードに書いた依頼がそのまま送られて作業が始まる。"
const LEAD_WITHOUT_CARDS = "入力欄から頼める。"
const TOP_BADGE = "いちばんのおすすめ"
const REQUEST_LABEL = "送られる依頼"

export function Welcome(): ReactElement {
  const model = useWelcome()
  const hasCards = model.cards.length > 0

  return (
    <div className={styles["welcome"]}>
      <div className={styles["head"]}>
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
      </div>
      {hasCards && (
        <ul className={styles["cards"]} data-count={model.cards.length}>
          {model.cards.map((card, index) => (
            <li key={card.key} className={styles["card-item"]}>
              <Card card={card} index={index} model={model} />
            </li>
          ))}
        </ul>
      )}
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
      <span className={styles["card-request"]}>
        <span className={styles["card-request-label"]}>{REQUEST_LABEL}</span>
        <span className={styles["card-request-text"]}>{card.request}</span>
      </span>
      <span className={styles["card-foot"]}>
        <kbd className={styles["card-key"]}>{index + 1}</kbd>
        <Button
          variant={top ? "solid-accent" : "outline"}
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={`${card.id} を始める（すぐ送る）`}
          disclosure={{ kind: "none" }}
          className={styles["card-start"]}
          onClick={() => {
            model.onStart(card)
          }}
        >
          始める
          <ArrowRightIcon />
        </Button>
      </span>
    </div>
  )
}
