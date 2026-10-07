// 入力欄の素の `<textarea>` の面。

import { useImperativeHandle, useRef, type ReactElement, type Ref } from "react"

import type { Draft } from "../../../../../../../stores/composer-draft.ts"
import styles from "../../dispatch.module.css"
import type { ComposerSurface, ComposerSurfaceHandlers } from "../../domain/composer-surface.ts"

export type TextAreaSurfaceProps = ComposerSurfaceHandlers & {
  readonly ref: Ref<ComposerSurface | null>
  readonly draft: Draft
  readonly placeholder: string
  readonly label: string
}

export function TextAreaSurface({
  ref,
  draft,
  placeholder,
  label,
  onChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
}: TextAreaSurfaceProps): ReactElement {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        textAreaRef.current?.focus()
      },
      caret: () => textAreaRef.current?.selectionStart ?? 0,
      placeCaret: (caret) => {
        textAreaRef.current?.setSelectionRange(caret, caret)
      },
    }),
    [],
  )

  return (
    <textarea
      ref={textAreaRef}
      className={styles["dispatch-text"]}
      placeholder={placeholder}
      aria-label={label}
      value={draft.text}
      onChange={(event) => {
        onChange({ text: event.target.value, caret: event.target.selectionStart })
      }}
      onKeyDown={(event) => {
        onKeyDown({
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          keyCode: event.keyCode,
          isComposing: event.nativeEvent.isComposing,
          preventDefault: () => {
            event.preventDefault()
          },
        })
      }}
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDrop={onDrop}
      required
    />
  )
}
