// 入力欄の素の `<textarea>` の面。

import {
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from "react"

import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { useComposerDraft, type Draft } from "../../stores/composer-draft.ts"
import styles from "./dispatch.module.css"
import type { ComposerSurface, ComposerSurfaceHandlers } from "./domain/composer-surface.ts"

type TextAreaSurfaceProps = ComposerSurfaceHandlers & {
  readonly ref: Ref<ComposerSurface | null>
  /** マウント時に1回だけ読む。以後の書き換えは `ComposerSurface.replace` で受ける。 */
  readonly initialDraft: Draft
  readonly placeholder: string
  readonly label: string
}

export function TextAreaSurface({
  ref,
  initialDraft,
  placeholder,
  label,
  onChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
}: TextAreaSurfaceProps): ReactElement {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  const [surface] = useState<ComposerSurface>(() => ({
    focus: () => {
      textAreaRef.current?.focus()
    },
    blur: () => {
      textAreaRef.current?.blur()
    },
    caret: () => textAreaRef.current?.selectionStart ?? 0,
    replace: (text, caret) => {
      const area = textAreaRef.current
      if (area !== null) {
        area.value = text
        area.setSelectionRange(caret, caret)
      }
    },
  }))
  useImperativeHandle(ref, () => surface, [surface])
  useExternalSync(() => useComposerDraft.getState().attachSurface(surface), [surface])

  const initialCaret = useEffectEvent(() => initialDraft.caret)
  // マウント時の1回だけ、初期の文面のキャレットを置く。
  useExternalSync(() => {
    const caret = initialCaret()
    textAreaRef.current?.setSelectionRange(caret, caret)
  }, [])

  return (
    <textarea
      ref={textAreaRef}
      className={styles["dispatch-text"]}
      placeholder={placeholder}
      aria-label={label}
      defaultValue={initialDraft.text}
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
