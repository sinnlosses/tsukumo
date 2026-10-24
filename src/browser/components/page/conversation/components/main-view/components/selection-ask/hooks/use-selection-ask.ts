// `<SelectionAsk>` のロジック。レポートの本文で字を選び終えたときに口の位置と字を持ち、押されたら引用を下書きの頭に入れて入力欄へフォーカスを送る。

import { useEffect, useState } from "react"

import { useComposerFocus } from "../../../../../../../../stores/composer-focus.ts"
import { useComposerDraft } from "../../../../../stores/composer-draft.ts"
import { quoteOf } from "../domain/selection-quote.ts"
import { reportSelectionOf, type ReportSelection } from "../domain/selection-range.ts"

/** 口の中で起きた操作かを見分ける印の名前。JSX の属性名に定数を書けないので、口の側は同じ綴りを直に置く。 */
const SELECTION_ASK_ATTRIBUTE = "data-selection-ask"

type SelectionAskView = {
  readonly selection: ReportSelection | undefined
  readonly onAsk: () => void
}

export function useSelectionAsk(): SelectionAskView {
  const [selection, setSelection] = useState<ReportSelection | undefined>(undefined)
  const prependToDraft = useComposerDraft((state) => state.prependToDraft)
  const requestFocus = useComposerFocus((state) => state.requestFocus)

  useEffect(() => {
    function show(): void {
      setSelection(reportSelectionOf(document.getSelection()))
    }
    function hide(): void {
      setSelection(undefined)
    }
    function onPointerUp(): void {
      show()
    }
    function onKeyUp(event: KeyboardEvent): void {
      if (isSelectionKey(event)) {
        show()
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        hide()
      }
    }
    function onPointerDown(event: PointerEvent): void {
      if (
        !(event.target instanceof Element && event.target.closest(`[${SELECTION_ASK_ATTRIBUTE}]`))
      ) {
        hide()
      }
    }
    function onSelectionChange(): void {
      if (reportSelectionOf(document.getSelection()) === undefined) {
        hide()
      }
    }
    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("keyup", onKeyUp)
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("selectionchange", onSelectionChange)
    document.addEventListener("scroll", hide, true)
    return () => {
      document.removeEventListener("pointerup", onPointerUp)
      document.removeEventListener("keyup", onKeyUp)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("selectionchange", onSelectionChange)
      document.removeEventListener("scroll", hide, true)
    }
  }, [])

  return {
    selection,
    onAsk: () => {
      if (selection === undefined) {
        return
      }
      prependToDraft(quoteOf(selection.text))
      requestFocus()
      setSelection(undefined)
    },
  }
}

const SELECTION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])

/** 選択の範囲を動かしうるキー（矢印・Home・End、Shift・Cmd・Ctrl つきのキー）。 */
function isSelectionKey(event: KeyboardEvent): boolean {
  return SELECTION_KEYS.has(event.key) || event.shiftKey || event.metaKey || event.ctrlKey
}
