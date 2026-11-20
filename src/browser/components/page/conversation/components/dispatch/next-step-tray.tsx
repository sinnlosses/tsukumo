// 入力欄の頭の次の一手の並び。押すと札の文を入力欄に足すだけで、送らない。
// 下見は最初に先頭の札の文を出し、触れた・フォーカスした・押した札の文に替わる。狭い画面（760px 以下）は下見を出さない。
// 下書きにその札の文が入っているあいだだけ札に印を付け、印の付いた札を押しても足さない（状態は持たず、下書きから求める）。
// 札の並びはタブ止まり1つ分で、← → で札を移り、↓ と修飾キーなしの Esc で入力欄へ戻る。

import clsx from "clsx"
import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react"

import type { NextStep } from "../../../../../features/report/next-step.ts"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import {
  returnFocusToComposerOnEscape,
  useComposerFocus,
} from "../../../../../stores/composer-focus.ts"
import { useComposerDraft } from "../../stores/composer-draft.ts"
import { useNextStepTray } from "../../stores/next-step-tray.ts"
import styles from "./dispatch.module.css"
import { FAVOR_BAND_TEXT } from "./domain/composer-band.ts"
import { draftHolds, nextStepChipsOf, type NextStepChip } from "./domain/next-step-chip.ts"
import {
  NEXT_STEP_CHIP_SELECTOR,
  NEXT_STEP_TRAY_ID,
  type NextStepTrayModel,
} from "./hooks/use-next-step-tray.ts"

type ShownTray = Extract<NextStepTrayModel, { readonly kind: "shown" }>

type NextStepTrayProps = {
  readonly steps: readonly NextStep[]
  readonly folded: boolean
  readonly favor: ShownTray["favor"]
}

export function NextStepTray(props: NextStepTrayProps): ReactElement {
  const phone = usePhoneWidth()
  const draftText = useComposerDraft((state) => state.draft.text)
  const appendDraft = useComposerDraft((state) => state.appendParagraphToDraft)
  const fold = useNextStepTray((state) => state.fold)
  const unfold = useNextStepTray((state) => state.unfold)
  const [choosing, setChoosing] = useState(false)
  // 空文字は、まだどの札にも触れていない（下見とタブ止まりは先頭の札）。
  const [previewKey, setPreviewKey] = useState("")
  const [focusKey, setFocusKey] = useState("")
  const chips = shownChipsOf(nextStepChipsOf(props.steps), choosing)
  const drafts = chips.flatMap((chip) => (chip.kind === "draft" ? [chip] : []))
  const previewed = drafts.find((chip) => chip.key === previewKey) ?? drafts[0]
  const tabStopKey = chips.find((chip) => chip.key === focusKey)?.key ?? chips[0]?.key

  const press = (chip: NextStepChip): void => {
    setPreviewKey(chip.key)
    if (chip.kind === "alternative") {
      setChoosing(!choosing)
      return
    }
    if (draftHolds(draftText, chip.draft)) {
      useComposerDraft.getState().surface?.focus()
      return
    }
    appendDraft(chip.draft)
  }

  const favorNote = props.favor.kind === "waiting" && (
    <>
      <span className={styles["next-step-tray-favor"]}>{FAVOR_BAND_TEXT}</span>
      <TrayAction onClick={props.favor.onJump}>{FAVOR_JUMP_LABEL}</TrayAction>
    </>
  )

  if (props.folded) {
    return (
      <div
        id={NEXT_STEP_TRAY_ID}
        role="group"
        aria-label={TRAY_LABEL}
        className={styles["next-step-tray"]}
        onKeyDown={returnOnKey}
      >
        <div className={styles["next-step-tray-head"]}>
          <TrayToggle expanded={false} onClick={unfold}>
            {`${String(nextStepChipsOf(props.steps).length)}件`}
          </TrayToggle>
          <span className={styles["next-step-tray-end"]}>{favorNote}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      id={NEXT_STEP_TRAY_ID}
      role="group"
      aria-label={TRAY_LABEL}
      className={styles["next-step-tray"]}
      onKeyDown={returnOnKey}
    >
      <div className={styles["next-step-tray-head"]}>
        <TrayToggle expanded onClick={fold} />
        <span>{trayNote(draftText === "", phone)}</span>
        <span className={styles["next-step-tray-end"]}>{favorNote}</span>
      </div>
      <div className={styles["next-step-tray-chips"]} onKeyDown={moveAmongChips}>
        {chips.map((chip) => {
          const held = chip.kind === "draft" && draftHolds(draftText, chip.draft)
          return (
            <button
              key={chip.key}
              type="button"
              data-next-step-chip=""
              tabIndex={chip.key === tabStopKey ? 0 : -1}
              aria-expanded={chip.kind === "alternative" ? choosing : undefined}
              className={clsx(
                styles["next-step-chip"],
                chip.key === previewed?.key && !phone && styles["is-previewed"],
                held && styles["is-held"],
              )}
              onMouseEnter={() => setPreviewKey(chip.key)}
              onFocus={() => {
                setPreviewKey(chip.key)
                setFocusKey(chip.key)
              }}
              onClick={() => press(chip)}
            >
              {held && (
                <span className={styles["next-step-chip-held"]} aria-hidden="true">
                  ✓
                </span>
              )}
              <span className={styles["next-step-chip-kind"]}>{chip.kindLabel}</span>{" "}
              <span className={styles["next-step-chip-label"]}>{chip.label}</span>
              {chip.kind === "alternative" && <span aria-hidden="true"> ▾</span>}
              {chip.kind === "draft" && chip.points > 0 && (
                <span
                  className={styles["next-step-chip-points"]}
                >{`${String(chip.points)}点`}</span>
              )}
            </button>
          )
        })}
      </div>
      {!phone && previewed !== undefined && (
        <p className={styles["next-step-tray-preview"]}>
          <span className={styles["next-step-tray-preview-label"]}>押すと入る文</span>
          {previewed.draft}
        </p>
      )}
    </div>
  )
}

const TRAY_LABEL = "次の一手"
const FAVOR_JUMP_LABEL = "お願いへ"

/** 見出しの右端の口（お願いへ）。 */
function TrayAction(props: {
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <button type="button" className={styles["next-step-tray-action"]} onClick={props.onClick}>
      {props.children}
    </button>
  )
}

/**
 * 見出しの「次の一手」の字そのものが、並びを開閉する口になる。
 * 読み上げの名前は「次の一手」で、開いているかは `aria-expanded` が言う。畳んだ形では件数（`children`）も口に含める。
 */
function TrayToggle(props: {
  readonly expanded: boolean
  readonly onClick: () => void
  readonly children?: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      className={styles["next-step-tray-toggle"]}
      onClick={props.onClick}
    >
      <span className={styles["next-step-tray-title"]}>{TRAY_LABEL}</span>
      {props.children}
      <TrayChevron direction={props.expanded ? "down" : "up"} />
    </button>
  )
}

/** 畳む・開くの向きの線画。字の ⌄・⌃ は書体によって小さく、下や上へ寄るので使わない。 */
function TrayChevron(props: { readonly direction: "up" | "down" }): ReactElement {
  return (
    <span
      className={clsx(
        styles["next-step-tray-chevron"],
        props.direction === "up" && styles["is-up"],
      )}
      aria-hidden="true"
    />
  )
}

/** 並びの中の ↓ と修飾キーなしの Esc で入力欄へ戻る。 */
function returnOnKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === "ArrowDown" && !hasModifier(event)) {
    event.preventDefault()
    useComposerFocus.getState().requestFocus()
    return
  }
  if (returnFocusToComposerOnEscape(event.nativeEvent)) {
    event.preventDefault()
    event.stopPropagation()
  }
}

/** ← → で隣の札へフォーカスを移す（端では止まる）。 */
function moveAmongChips(event: KeyboardEvent<HTMLElement>): void {
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
  if (step === 0 || hasModifier(event)) {
    return
  }
  const chips = [...event.currentTarget.querySelectorAll<HTMLElement>(NEXT_STEP_CHIP_SELECTOR)]
  const index = chips.findIndex((chip) => chip === event.target)
  if (index < 0) {
    return
  }
  event.preventDefault()
  chips[Math.min(Math.max(index + step, 0), chips.length - 1)]?.focus()
}

function hasModifier(event: KeyboardEvent<HTMLElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

/** 見出しの案内。下書きに字があれば、押すと後ろに足すことを言う。狭い画面は短く言う。 */
function trayNote(draftEmpty: boolean, phone: boolean): string {
  if (phone) {
    return draftEmpty ? "押すと入る（送らない）" : "押すと後ろに足す（送らない）"
  }
  return draftEmpty
    ? "押すと下の入力欄に入る（送らない）"
    : "押すと下の入力欄の後ろに足す（送らない）"
}

/** 案を選んでいるあいだは、別の案の札の後ろに案の札を並べる。 */
function shownChipsOf(chips: readonly NextStepChip[], choosing: boolean): readonly NextStepChip[] {
  return chips.flatMap((chip) =>
    chip.kind === "alternative" && choosing ? [chip, ...chip.options] : [chip],
  )
}
