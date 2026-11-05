import clsx from "clsx"
import { useRef, type ReactElement } from "react"

import { Menu } from "../../../../ui/menu/menu.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VisuallyHidden } from "../../../../ui/visually-hidden/visually-hidden.tsx"
import { dropLineSlot } from "../../domain/step-reorder.ts"
import { useStepGrab } from "../../hooks/use-step-grab.ts"
import type { ScreenNavWorkflowSettingStepsRow } from "../../hooks/use-workflow-setting.ts"
import sharedStyles from "../screen-nav-settings-workflow.module.css"
import styles from "./workflow-step-list.module.css"
import { stepMenuItems } from "./workflow-step-menu-item-list.ts"

/** つかむ点の6つの点（2列×3行）。 */
const GRIP_DOTS = [0, 1, 2, 3, 4, 5] as const

/**
 * 行の札の並び。左のつかむ点をポインタで押して動かすか、Space でつかんで ↑↓ で動かし Space で置く。
 * つかんだ札は元の位置から浮かせ、置き場所は行の間の線で見せる（行そのものは動かさない）。
 */
export function WorkflowStepList(props: {
  readonly row: ScreenNavWorkflowSettingStepsRow
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
                  {step.known && <span className={sharedStyles["step-id"]}>{step.label}</span>}
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
      <VisuallyHidden
        element="p"
        role="status"
        aria-live="polite"
        aria-atomic={undefined}
        data-live-announcer={undefined}
      >
        {announcement}
      </VisuallyHidden>
    </>
  )
}
