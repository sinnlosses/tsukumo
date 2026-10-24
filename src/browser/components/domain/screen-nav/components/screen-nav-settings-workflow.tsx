// 設定のダイアログの「ワークフロー」の面。どのリポジトリの設定かを先頭に出し、並びの欄ごとに、
// 頭の行・流れの帯・行の札（つかむ点・番号・名前・識別子・説明・「…」）・並びに入っていないスキルの札を置く。
// 下の帯に「やめる」「保存」を置き、操作は保存するまで書かない。
// 欄はワークフローの設定コマンドから来たものだけで、出せないときは欄を出さずに何が無いかを1文で言う。

import clsx from "clsx"
import { Plus } from "lucide-react"
import { Fragment, useRef, type ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Menu, type MenuItem } from "../../../ui/menu/menu.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { dropLineSlot } from "../domain/step-reorder.ts"
import { useStepGrab } from "../hooks/use-step-grab.ts"
import {
  useWorkflowSetting,
  type ScreenNavWorkflowSettingDraftChange,
  type ScreenNavWorkflowSettingRepository,
  type ScreenNavWorkflowSettingRow,
  type ScreenNavWorkflowSettingStep,
} from "../hooks/use-workflow-setting.ts"
import { ScreenNavSettingsFaceFrame } from "./screen-nav-settings-face-frame.tsx"
import styles from "./screen-nav-settings-workflow.module.css"

/** つかむ点の6つの点（2列×3行）。 */
const GRIP_DOTS = [0, 1, 2, 3, 4, 5] as const

export function ScreenNavSettingsWorkflowFace(props: { readonly title: string }): ReactElement {
  const setting = useWorkflowSetting()

  switch (setting.kind) {
    case "loading":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} foot={undefined}>
          <WorkflowMessage text="ワークフローの設定を読んでいる…" tone="ink-quiet" />
        </ScreenNavSettingsFaceFrame>
      )
    case "unreachable":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} foot={undefined}>
          <WorkflowMessage text={setting.message} tone="state-warn" />
        </ScreenNavSettingsFaceFrame>
      )
    case "unavailable":
      return (
        <ScreenNavSettingsFaceFrame title={props.title} foot={undefined}>
          <WorkflowRepository repository={setting.repository} />
          <WorkflowMessage text={setting.message} tone="ink" />
        </ScreenNavSettingsFaceFrame>
      )
    case "available":
      return (
        <ScreenNavSettingsFaceFrame
          title={props.title}
          foot={
            <WorkflowSaveBand
              change={setting.change}
              busy={setting.busy}
              onSave={setting.onSave}
              onCancel={setting.onCancel}
            />
          }
        >
          <WorkflowRepository repository={setting.repository} />
          {setting.rows.map((row) => (
            <WorkflowStepsField key={row.key} row={row} busy={setting.busy} />
          ))}
        </ScreenNavSettingsFaceFrame>
      )
  }
}

function WorkflowStepsField(props: {
  readonly row: ScreenNavWorkflowSettingRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  return (
    <div className={styles["field"]}>
      <div className={styles["field-head"]}>
        <Text
          element="p"
          size="subheading"
          tone="ink"
          weight="bold"
          className={styles["field-label"]}
        >
          {row.label}
        </Text>
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["field-description"]}
        >
          {row.description}
        </Text>
      </div>
      <WorkflowFlow steps={row.steps} />
      <WorkflowStepList row={row} busy={busy} />
      {row.addable.length > 0 && (
        <div className={styles["parked"]}>
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["parked-head"]}
          >
            並びに入っていないスキル<span className={styles["parked-hint"]}>押すと最後に足す</span>
          </Text>
          <div className={styles["parked-chips"]}>
            {row.addable.map((option) => (
              <Button
                key={option.value}
                variant="outline-dashed"
                size="secondary"
                pressed="none"
                disabled={busy}
                ariaLabel={`${option.title} を並びの最後に足す`}
                disclosure={{ kind: "none" }}
                className={styles["parked-chip"]}
                onClick={() => {
                  row.onAdd(option.value)
                }}
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                <span className={styles["step-title"]}>{option.title}</span>
                <span className={styles["step-id"]}>{option.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
      {row.addable.length === 0 && (
        <p className={styles["parked-empty"]}>
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          足せるスキルはない（{row.steps.filter((step) => step.known).length}
          つとも並んでいる）
        </p>
      )}
      {row.notice.kind === "shown" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={styles["notice"]}
        >
          {row.notice.text}
        </Text>
      )}
    </div>
  )
}

/**
 * 行の札の並び。左のつかむ点をポインタで押して動かすか、Space でつかんで ↑↓ で動かし Space で置く。
 * つかんだ札は元の位置から浮かせ、置き場所は行の間の線で見せる（行そのものは動かさない）。
 */
function WorkflowStepList(props: {
  readonly row: ScreenNavWorkflowSettingRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  const listRef = useRef<HTMLOListElement>(null)
  const enabled = row.reorderable && !busy
  const { view, announcement, handlers } = useStepGrab({
    titles: row.steps.map((step) => step.title),
    enabled,
    listRef,
    onReorder: row.onReorder,
  })
  const lineSlot =
    view.kind === "grabbed" && view.from !== view.to ? dropLineSlot(view.from, view.to) : -1
  return (
    <>
      <ol ref={listRef} className={styles["steps"]} aria-label={row.label}>
        {row.steps.map((step, index) => {
          const grabbed = view.kind === "grabbed" && view.from === index
          return (
            <li
              key={step.value}
              className={clsx(
                styles["step"],
                step.moved && styles["step-moved"],
                grabbed && styles["step-grabbed"],
                lineSlot === index && styles["step-drop-before"],
                lineSlot === index + 1 &&
                  index === row.steps.length - 1 &&
                  styles["step-drop-after"],
              )}
              style={grabbed ? { "--step-drag-offset": `${view.offsetY}px` } : undefined}
            >
              <button
                type="button"
                className={styles["step-grip"]}
                aria-label={`${step.title} を動かす（↑↓ キーでも）`}
                disabled={!enabled}
                onPointerDown={(event) => {
                  handlers.onPointerDown(index, event)
                }}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
                onKeyDown={(event) => {
                  handlers.onKeyDown(index, event)
                }}
                onBlur={handlers.onBlur}
              >
                <span className={styles["step-grip-dots"]} aria-hidden="true">
                  {GRIP_DOTS.map((dot) => (
                    <span key={dot} className={styles["step-grip-dot"]} />
                  ))}
                </span>
              </button>
              <span className={styles["step-number"]} aria-hidden="true">
                {index + 1}
              </span>
              <div className={styles["step-body"]}>
                <p className={styles["step-name"]}>
                  <span className={styles["step-title"]}>{step.title}</span>
                  {step.known && <span className={styles["step-id"]}>{step.label}</span>}
                  {!step.known && (
                    <Text
                      element="span"
                      size="label"
                      tone="state-warn"
                      weight="inherit"
                      className={styles["step-unknown"]}
                    >
                      候補に無い
                    </Text>
                  )}
                  {step.moved && (
                    <Text
                      element="span"
                      size="label"
                      tone="state-warn"
                      weight="inherit"
                      className={styles["step-moved-mark"]}
                    >
                      <span aria-hidden="true">● </span>並びを変えた
                    </Text>
                  )}
                </p>
                {step.description !== "" && (
                  <p className={styles["step-description"]} title={step.description}>
                    {step.description}
                  </p>
                )}
              </div>
              <Menu
                triggerLabel={`${step.title} の操作`}
                disabled={busy}
                items={stepMenuItems(row, step, index)}
                className={styles["step-menu"]}
              />
            </li>
          )
        })}
      </ol>
      <p className={styles["announcer"]} role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}

/** 行と同じ中身を順の1本で見せる。読み上げは行の並びが持つ。 */
function WorkflowFlow(props: {
  readonly steps: readonly ScreenNavWorkflowSettingStep[]
}): ReactElement {
  return (
    <div className={styles["flow"]} aria-hidden="true">
      {props.steps.map((step, index) => (
        <Fragment key={step.value}>
          {index > 0 && <span className={styles["flow-arrow"]}>→</span>}
          <span className={styles["flow-chip"]}>
            <span className={styles["flow-number"]}>{index + 1}</span>
            {step.title}
          </span>
        </Fragment>
      ))}
    </div>
  )
}

function stepMenuItems(
  row: ScreenNavWorkflowSettingRow,
  step: ScreenNavWorkflowSettingStep,
  index: number,
): readonly MenuItem[] {
  return [
    {
      key: "top",
      label: "いちばん上へ",
      tone: "default",
      disabled: !step.canMoveUp,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "top")
      },
    },
    {
      key: "up",
      label: "ひとつ上へ",
      tone: "default",
      disabled: !step.canMoveUp,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "up")
      },
    },
    {
      key: "down",
      label: "ひとつ下へ",
      tone: "default",
      disabled: !step.canMoveDown,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "down")
      },
    },
    {
      key: "bottom",
      label: "いちばん下へ",
      tone: "default",
      disabled: !step.canMoveDown,
      separatorBefore: false,
      onSelect: () => {
        row.onMove(index, "bottom")
      },
    },
    {
      key: "remove",
      label: "並びから外す",
      tone: "danger",
      disabled: !step.canRemove,
      separatorBefore: true,
      onSelect: () => {
        row.onRemove(index)
      },
    },
  ]
}

function WorkflowSaveBand(props: {
  readonly change: ScreenNavWorkflowSettingDraftChange
  readonly busy: boolean
  readonly onSave: () => void
  readonly onCancel: () => void
}): ReactElement {
  const unchanged = props.change.kind === "none"
  return (
    <>
      {props.change.kind === "changed" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={styles["change"]}
        >
          <span aria-hidden="true">● </span>
          {props.change.text}
        </Text>
      )}
      <Button
        variant="outline"
        size="label"
        pressed="none"
        disabled={unchanged || props.busy}
        disclosure={{ kind: "none" }}
        className={styles["save-band-button"]}
        onClick={props.onCancel}
      >
        やめる
      </Button>
      <Button
        variant="solid-ink"
        size="label"
        pressed="none"
        disabled={unchanged || props.busy}
        disclosure={{ kind: "none" }}
        className={styles["save-band-button"]}
        onClick={props.onSave}
      >
        保存
      </Button>
    </>
  )
}

function WorkflowRepository(props: {
  readonly repository: ScreenNavWorkflowSettingRepository
}): ReactElement {
  return (
    <div className={styles["repository"]}>
      <Text
        element="p"
        size="secondary"
        tone="ink"
        weight="bold"
        className={styles["repository-name"]}
      >
        {props.repository.name} のリポジトリ
      </Text>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["repository-path"]}
      >
        {props.repository.path}
      </Text>
    </div>
  )
}

function WorkflowMessage(props: {
  readonly text: string
  readonly tone: "ink" | "ink-quiet" | "state-warn"
}): ReactElement {
  return (
    <Text
      element="p"
      size="secondary"
      tone={props.tone}
      weight="inherit"
      className={styles["message"]}
    >
      {props.text}
    </Text>
  )
}
