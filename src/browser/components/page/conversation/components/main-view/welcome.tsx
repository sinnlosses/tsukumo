// 迎える局面のメインビューの中身。見出しと、おすすめのカード（押すと送る依頼の確認が開く）と、ほかの始め方を出す。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { codeSpanParts } from "../../../../../domain/code-span.ts"
import { TaskSummaryText } from "../../../../../features/task-board/task-summary-text.tsx"
import { CharacterFace } from "../../../../frame/character-face.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { ConfirmDialog, ConfirmDialogCode } from "../../../../ui/confirm-dialog/confirm-dialog.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import {
  ArrowRightIcon,
  HistoryIcon,
  ListIcon,
  PencilIcon,
  SendIcon,
} from "../../../../ui/icon/icon.tsx"
import { Kbd } from "../../../../ui/kbd/kbd.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { WelcomeCard } from "../../domain/welcome-entry-list.ts"
import { useWelcome, type WelcomeModel } from "./hooks/use-welcome.ts"
import styles from "./main-view.module.css"

const TITLE = "何から始める？"
const LEAD_WITH_CARDS = "tsukumo のおすすめ。「始める」を押すと、確認のあとに作業が始まる。"
const LEAD_WITHOUT_CARDS = "下の入力欄から頼める。"
const TOP_BADGE = "いちばんのおすすめ"
const OTHERS_LABEL = "ほかの始め方"

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
      <Others model={model} primary={!hasCards} />
      {model.confirming !== undefined && <StartConfirm card={model.confirming} model={model} />}
    </div>
  )
}

function StartConfirm(props: {
  readonly card: WelcomeCard
  readonly model: WelcomeModel
}): ReactElement {
  const { card, model } = props
  return (
    <ConfirmDialog
      ariaLabel="始め方の実行"
      heading={card.kind === "resume" ? "前回の続きを実行しますか" : `${card.id} を実行しますか`}
      note={
        <>
          <ConfirmDialogCode>{card.request}</ConfirmDialogCode> が実行されます。
        </>
      }
      cancelLabel="キャンセル"
      confirm={{
        label: "頼む",
        icon: <SendIcon />,
        onPress: () => {
          model.onConfirm(card)
        },
      }}
      onClose={model.onCancel}
    />
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
        <span className={styles["card-key"]}>
          <Kbd keys={String(index + 1)} />
        </span>
        <Button
          variant={top ? "solid-accent" : "outline"}
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={`${card.id} を始める`}
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
      <div className={styles["other-list"]}>
        <OtherButton primary={primary} onClick={model.onWrite}>
          <PencilIcon />
          自分で書く
          <span className={styles["card-key"]}>
            <Kbd keys="/" />
          </span>
        </OtherButton>
        <OtherButton primary={false} onClick={model.onPickTask}>
          <ListIcon />
          <span>
            <span className={styles["other-phrase"]}>タスクの一覧</span>
            <span className={styles["other-phrase"]}>から選ぶ</span>
          </span>
        </OtherButton>
        {model.hasOtherSessions && (
          <OtherButton primary={false} onClick={model.onSeePrevious}>
            <HistoryIcon />
            <span>
              <span className={styles["other-phrase"]}>前のやり取り</span>
              <span className={styles["other-phrase"]}>を見る</span>
            </span>
            <span className={styles["card-key"]}>
              <Kbd keys="←" />
            </span>
          </OtherButton>
        )}
      </div>
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
      disclosure={{ kind: "none" }}
      className={styles["other"]}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}
