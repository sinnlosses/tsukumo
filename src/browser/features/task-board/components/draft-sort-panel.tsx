// ドラフトの分類の場面の中身。
// `DraftSortPanel` は題と件数・閉じる口の帯 → ドラフトの札（内側で転がる）の2つ、`DraftSortBand` は下端の口を返す。
// 器と置き方は置く側が持つ。
// 札は状態の印と語・番号・難しさ・題・本文の頭・3択（計画・却下・あとで）。却下を選んだ札だけ理由の欄が出る。
// 選んだ札は色だけでなく、左のチェックの印と字・地の色で伝える。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { CheckIcon, CloseIcon, SendIcon } from "../../../components/ui/icon/icon.tsx"
import { TextField } from "../../../components/ui/text-field/text-field.tsx"
import type { DraftSortChoice } from "../domain/draft-sort.ts"
import type { DraftSortCard, DraftSortPanelView } from "../domain/task-board-view.ts"
import taskBoardStyles from "../task-board.module.css"
import { TaskSummaryText } from "../task-summary-text.tsx"
import styles from "./draft-sort-sheet.module.css"
import { TaskDifficultyWord } from "./task-attribute.tsx"
import sheetStyles from "./task-sheet.module.css"
import { TaskState } from "./task-state.tsx"

const CHOICES = [
  { choice: "plan", label: "計画" },
  { choice: "drop", label: "却下" },
  { choice: "later", label: "あとで" },
] as const satisfies readonly { readonly choice: DraftSortChoice; readonly label: string }[]

const CHOICE_CLASS = {
  plan: styles["draft-sort-plan"],
  drop: styles["draft-sort-drop"],
  later: styles["draft-sort-later"],
} satisfies Record<DraftSortChoice, string>

export function DraftSortPanel(props: {
  readonly panel: DraftSortPanelView
  /** 題の DOM の id。器の `aria-labelledby` が指す。 */
  readonly titleId: string
  readonly onClose: () => void
}): ReactElement {
  const { panel } = props
  return (
    <>
      <div className={sheetStyles["task-sheet-head"]}>
        <h2 id={props.titleId} className={styles["draft-sort-title"]}>
          ドラフトを仕分ける
          <span className={styles["draft-sort-count"]}>{panel.cards.length}</span>
        </h2>
        <Button
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel="閉じる"
          disclosure={{ kind: "none" }}
          className={sheetStyles["task-sheet-tool"]}
          onClick={props.onClose}
        >
          <CloseIcon />
        </Button>
      </div>
      <ul className={styles["draft-sort-list"]}>
        {panel.cards.map((card) => (
          <DraftSortCardItem key={card.id} card={card} panel={panel} />
        ))}
      </ul>
    </>
  )
}

export function DraftSortBand(props: { readonly band: DraftSortPanelView["band"] }): ReactElement {
  const { band } = props
  return (
    <div className={styles["draft-sort-band"]}>
      {band.kind === "some" && (
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["draft-sort-reset"]}
          onClick={band.onReset}
        >
          仕分けを戻す
        </Button>
      )}
      <span className={styles["draft-sort-later-count"]}>あとで {band.laterCount} 件</span>
      <Button
        variant="solid-accent"
        size="subheading"
        pressed="none"
        disabled={band.kind === "none" || band.blockedReason !== undefined}
        disclosure={{ kind: "dialog" }}
        title={band.kind === "some" ? band.blockedReason : undefined}
        className={styles["draft-sort-request"]}
        onClick={band.kind === "some" ? band.onRequest : ignoreClick}
      >
        <SendIcon />
        {requestLabelOf(band)}
      </Button>
    </div>
  )
}

function DraftSortCardItem(props: {
  readonly card: DraftSortCard
  readonly panel: DraftSortPanelView
}): ReactElement {
  const { card, panel } = props
  return (
    <li className={styles["draft-sort-card"]}>
      <p className={styles["draft-sort-top"]}>
        <TaskState state={card.state} display="labeled" />
        <span className={taskBoardStyles["task-id"]}>{card.id}</span>
        {card.difficulty !== undefined && (
          <TaskDifficultyWord difficulty={card.difficulty} scale={false} />
        )}
      </p>
      <h3 className={styles["draft-sort-summary"]}>
        <TaskSummaryText parts={card.summary} />
      </h3>
      {card.bodyHead !== "" && <p className={styles["draft-sort-body"]}>{card.bodyHead}</p>}
      <div
        role="radiogroup"
        aria-label={`${card.id} の仕分け`}
        className={styles["draft-sort-group"]}
      >
        {CHOICES.map((item) => {
          const checked = card.choice === item.choice
          return (
            <button
              key={item.choice}
              type="button"
              role="radio"
              aria-checked={checked}
              className={clsx(
                styles["draft-sort-button"],
                CHOICE_CLASS[item.choice],
                checked && styles["draft-sort-on"],
              )}
              onClick={() => {
                panel.onChoose(card.id, item.choice)
              }}
            >
              {checked && (
                <span className={styles["draft-sort-check"]} aria-hidden="true">
                  <CheckIcon />
                </span>
              )}
              {item.label}
            </button>
          )
        })}
      </div>
      {card.choice === "drop" && (
        <label className={styles["draft-sort-reason"]}>
          <span>却下の理由</span>
          <TextField
            element="input"
            id={`draft-sort-reason-${card.id}`}
            className={styles["draft-sort-reason-input"]}
            value={card.reason}
            onChange={(reason) => {
              panel.onReason(card.id, reason)
            }}
          />
        </label>
      )}
    </li>
  )
}

/** 「計画 2・却下 1 を頼む」。0件の側は出さず、どちらも無いうちは「頼む」だけ。 */
function requestLabelOf(band: DraftSortPanelView["band"]): string {
  if (band.kind === "none") {
    return "頼む"
  }
  const parts = [
    band.planCount > 0 ? `計画 ${band.planCount}` : undefined,
    band.dropCount > 0 ? `却下 ${band.dropCount}` : undefined,
  ].filter((part) => part !== undefined)
  return `${parts.join("・")} を頼む`
}

/** 押せないボタンの `onClick`（`Button` は押せないときに呼ばない）。 */
function ignoreClick(): void {}
