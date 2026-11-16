// サイドシートの分類の場面の器だけ。フックも算出も持たず、受け取った値と呼び先をそのまま置く。
//
// 上から、題と件数・閉じる口の帯 → ドラフトの札（内側で転がる） → 下端の口。
// 札は状態の印と語・番号・難しさ・題・本文の頭・3択（計画・却下・あとで）。却下を選んだ札だけ理由の欄が出る。
// 選んだ札は色だけでなく、左のチェックの印と字・地の色で伝える。
// 確認（`TaskRunConfirm`）はモーダルの `<dialog>` で最上位の層に出るので、サイドシートの上に重なる。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import { CheckIcon, CloseIcon, SendIcon } from "../../components/ui/icon/icon.tsx"
import { TextField } from "../../components/ui/text-field/text-field.tsx"
import styles from "./components/draft-sort-sheet.module.css"
import { TaskDifficultyWord } from "./components/task-attribute.tsx"
import { TaskRunConfirm } from "./components/task-run-confirm.tsx"
import sheetStyles from "./components/task-sheet.module.css"
import { TaskState } from "./components/task-state.tsx"
import type { DraftSortCard } from "./domain/draft-sort-sheet-content.ts"
import type { DraftSortChoice } from "./domain/draft-sort.ts"
import { TASK_SHEET_DOM_ID } from "./domain/task-row-dom-id.ts"
import type { DraftSortSheetView } from "./hooks/use-draft-sort-sheet.ts"
import taskBoardStyles from "./task-board.module.css"
import { TaskSummaryText } from "./task-summary-text.tsx"

const TITLE_ID = "draft-sort-sheet-title"

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

export function PresentationalDraftSortSheet(props: {
  readonly view: DraftSortSheetView
}): ReactElement {
  const { view } = props
  return (
    <aside
      id={TASK_SHEET_DOM_ID}
      aria-labelledby={TITLE_ID}
      tabIndex={-1}
      className={sheetStyles["task-sheet"]}
      onKeyDown={view.onKeyDown}
    >
      <div className={sheetStyles["task-sheet-head"]}>
        <h2 id={TITLE_ID} className={styles["draft-sort-title"]}>
          ドラフトを仕分ける
          <span className={styles["draft-sort-count"]}>{view.cards.length}</span>
        </h2>
        <Button
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          ariaLabel="閉じる"
          disclosure={{ kind: "none" }}
          className={sheetStyles["task-sheet-tool"]}
          onClick={view.onClose}
        >
          <CloseIcon />
        </Button>
      </div>
      <ul className={styles["draft-sort-list"]}>
        {view.cards.map((card) => (
          <DraftSortCardItem key={card.id} card={card} view={view} />
        ))}
      </ul>
      <div className={styles["draft-sort-band"]}>
        {view.band.kind === "some" && (
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["draft-sort-reset"]}
            onClick={view.band.onReset}
          >
            仕分けを戻す
          </Button>
        )}
        <span className={styles["draft-sort-later-count"]}>あとで {view.band.laterCount} 件</span>
        <Button
          variant="solid-accent"
          size="subheading"
          pressed="none"
          disabled={view.band.kind === "none"}
          disclosure={{ kind: "dialog" }}
          className={styles["draft-sort-request"]}
          onClick={view.band.kind === "some" ? view.band.onRequest : ignoreClick}
        >
          <SendIcon />
          {requestLabelOf(view.band)}
        </Button>
      </div>
      {view.confirm.kind === "open" && (
        <TaskRunConfirm target={view.confirm.target} onClose={view.onConfirmClose} />
      )}
    </aside>
  )
}

function DraftSortCardItem(props: {
  readonly card: DraftSortCard
  readonly view: DraftSortSheetView
}): ReactElement {
  const { card, view } = props
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
                view.onChoose(card.id, item.choice)
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
              view.onReason(card.id, reason)
            }}
          />
        </label>
      )}
    </li>
  )
}

/** 「計画 2・却下 1 を頼む」。0件の側は出さず、どちらも無いうちは「頼む」だけ。 */
function requestLabelOf(band: DraftSortSheetView["band"]): string {
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
