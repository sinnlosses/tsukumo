// 探す欄と群つきの行から1つ選んで走らせるパレット。中身は Astryx の `CommandPalette`。
//
// 開くと最初の行を選んだ状態で始まり、Ctrl+P / Ctrl+N でも選びが動く。
// Enter と行のクリックは `onRun` のあと `onClose` を呼び、Esc と外側のクリックは `onClose` だけを呼ぶ。

import {
  CommandPalette as AstryxCommandPalette,
  CommandPaletteInput,
  useCommandPaletteContext,
} from "@astryxdesign/core/CommandPalette"
import type { SearchSource } from "@astryxdesign/core/Typeahead"
import { useState, type KeyboardEvent, type ReactElement } from "react"

import { acquireOverlay } from "../../../hooks/open-overlay.ts"
import { useBeforePaintSync } from "../../../hooks/use-before-paint-sync.ts"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import { Kbd } from "../kbd/kbd.tsx"
import styles from "./command-palette.module.css"

export type CommandPaletteRow = {
  readonly id: string
  readonly label: string
  /** 群の見出しの文。群は渡した行の中で初めに出た順に並ぶ。 */
  readonly group: string
  /** `Kbd` の `keys`。 */
  readonly keys?: string
  /** 名前の右に薄く添える文。 */
  readonly hint?: string
  /** 何か打つまで並べない行。 */
  readonly hiddenUntilTyped: boolean
}

export type CommandPaletteProps = {
  readonly open: boolean
  readonly ariaLabel: string
  readonly placeholder: string
  readonly searchLabel: string
  readonly emptyText: string
  readonly rows: readonly CommandPaletteRow[]
  readonly onClose: () => void
  readonly onRun: (id: string) => void
}

type PaletteItem = {
  readonly id: string
  readonly label: string
  readonly auxiliaryData: { readonly group: string }
  readonly row: CommandPaletteRow
}

type HeldSource = {
  readonly key: string
  readonly source: SearchSource<PaletteItem>
}

export function CommandPalette(props: CommandPaletteProps): ReactElement {
  useExternalSync(() => (props.open ? acquireOverlay() : undefined), [props.open])
  const source = useStableSource(props.rows)

  return (
    <AstryxCommandPalette
      isOpen={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose()
        }
      }}
      onValueChange={props.onRun}
      searchSource={source}
      label={props.ariaLabel}
      width="min(34rem, calc(100vw - 2rem))"
      maxHeight="calc(100dvh - 12rem)"
      emptySearchText={props.emptyText}
      emptyBootstrapText=""
      input={<PaletteInput label={props.searchLabel} placeholder={props.placeholder} />}
      footer={<></>}
      renderItem={(item) => <PaletteRow row={item.row} />}
      className={styles["command-palette"]}
    />
  )
}

// 源が描くたびに変わると、Astryx は開いている間の問い合わせを毎回打ち直す。
// 行の中身が変わったときだけ作り直す。
function useStableSource(rows: readonly CommandPaletteRow[]): SearchSource<PaletteItem> {
  const key = JSON.stringify(rows)
  const [held, setHeld] = useState<HeldSource>(() => ({ key, source: searchSourceOf(rows) }))
  if (held.key !== key) {
    const next = { key, source: searchSourceOf(rows) }
    setHeld(next)
    return next.source
  }
  return held.source
}

function searchSourceOf(rows: readonly CommandPaletteRow[]): SearchSource<PaletteItem> {
  const items = rows.map((row): PaletteItem => ({
    id: row.id,
    label: row.label,
    auxiliaryData: { group: row.group },
    row,
  }))
  const untyped = (): PaletteItem[] => items.filter((item) => !item.row.hiddenUntilTyped)
  return {
    bootstrap: untyped,
    search: (query) => {
      const needle = query.trim().toLowerCase()
      return needle === ""
        ? untyped()
        : items.filter((item) => item.label.toLowerCase().includes(needle))
    },
  }
}

function PaletteInput(props: {
  readonly label: string
  readonly placeholder: string
}): ReactElement {
  const context = useCommandPaletteContext()
  const selectable = context?.selectableItems
  const setHighlighted = context?.setHighlightedIndex

  // Astryx は問い合わせのたびに選びを外すので、結果が届いたら最初の行へ戻す。
  useBeforePaintSync(() => {
    if (selectable !== undefined && selectable.length > 0) {
      setHighlighted?.(0)
    }
  }, [selectable, setHighlighted])

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (context === null || event.nativeEvent.isComposing || !event.ctrlKey || event.metaKey) {
      return
    }
    const step = event.key === "n" ? 1 : event.key === "p" ? -1 : 0
    if (step === 0) {
      return
    }
    event.preventDefault()
    const last = context.selectableItems.length - 1
    context.setHighlightedIndex(Math.min(Math.max(context.highlightedIndex + step, 0), last))
  }

  return (
    <CommandPaletteInput
      label={props.label}
      placeholder={props.placeholder}
      onKeyDown={onKeyDown}
    />
  )
}

function PaletteRow(props: { readonly row: CommandPaletteRow }): ReactElement {
  return (
    <span className={styles["row"]}>
      <span className={styles["label"]}>{props.row.label}</span>
      {props.row.hint !== undefined && <span className={styles["hint"]}>{props.row.hint}</span>}
      {props.row.keys !== undefined && <Kbd keys={props.row.keys} />}
    </span>
  )
}
