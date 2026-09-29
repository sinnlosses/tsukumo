// 入力欄のマークダウンエディタの面（CodeMirror）。
// 記号を残したまま、Markdown の構文木に沿って字の大きさ・太さ・色・等幅だけを付ける。
// 記号を隠す置き換え（`Decoration.replace`）は使わない。
// 変換中のキャレットの前後で DOM の形が変わり、IME の確定を壊しうるため。
//
// 下書きの持ち主はこの外にある。
// 打った結果は `onChange` で外へ返し、外で変わった下書き（補完の確定・送信後の空）は文面が違うときだけ書き写す。

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdownLanguage } from "@codemirror/lang-markdown"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state"
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type ReactElement,
  type Ref,
} from "react"

import type {
  ComposerKey,
  ComposerSurface,
  ComposerSurfaceHandlers,
  Draft,
} from "../../domain/composer-surface.ts"
import styles from "./markdown-editor-surface.module.css"

export type MarkdownEditorSurfaceProps = ComposerSurfaceHandlers & {
  readonly ref: Ref<ComposerSurface | null>
  readonly draft: Draft
  readonly placeholder: string
}

export function MarkdownEditorSurface({
  ref,
  draft,
  placeholder,
  onChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
}: MarkdownEditorSurfaceProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const initialDraft = useEffectEvent(() => ({ draft, placeholder }))
  const changed = useEffectEvent((next: Draft) => {
    onChange(next)
  })
  const keyDown = useEffectEvent((key: ComposerKey) => onKeyDown(key))
  const paste = useEffectEvent((event: ClipboardEvent) => {
    onPaste(event)
  })
  const dragOver = useEffectEvent((event: DragEvent) => {
    onDragOver(event)
  })
  const drop = useEffectEvent((event: DragEvent) => {
    onDrop(event)
  })

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        viewRef.current?.focus()
      },
      caret: () => viewRef.current?.state.selection.main.head ?? 0,
      placeCaret: (caret) => {
        const view = viewRef.current
        if (view !== null) {
          view.dispatch({
            selection: { anchor: Math.min(caret, view.state.doc.length) },
            annotations: FROM_DRAFT.of(true),
          })
        }
      },
    }),
    [],
  )

  useEffect(() => {
    const host = hostRef.current
    if (host === null) {
      return
    }
    const initial = initialDraft()
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.draft.text,
        selection: { anchor: Math.min(initial.draft.caret, initial.draft.text.length) },
        extensions: [
          // 補完のキーと Command+Enter の送信は、CodeMirror の keymap より先にこちらが取る。
          Prec.highest(
            EditorView.domEventHandlers({
              keydown: (event) =>
                keyDown({
                  key: event.key,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  keyCode: event.keyCode,
                  isComposing: event.isComposing,
                  preventDefault: () => {
                    event.preventDefault()
                  },
                }),
              // 画像を取ったときだけ `preventDefault` されるので、そのときだけ字の挿入へ流さない。
              paste: (event) => {
                paste(event)
                return event.defaultPrevented
              },
              dragover: (event) => {
                dragOver(event)
                return event.defaultPrevented
              },
              drop: (event) => {
                drop(event)
                return event.defaultPrevented
              },
            }),
          ),
          history(),
          keymap.of([...EDITOR_KEYMAP, ...historyKeymap]),
          markdownLanguage,
          syntaxHighlighting(MARKDOWN_HIGHLIGHT),
          EditorView.lineWrapping,
          EditorView.editorAttributes.of({ class: styles["markdown-editor-view"] }),
          PLACEHOLDER.of(placeholderExtension(initial.placeholder)),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some(
                (transaction) => transaction.annotation(FROM_DRAFT) === true,
              )
            ) {
              changed({
                text: update.state.doc.toString(),
                caret: update.state.selection.main.head,
              })
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view === null || view.state.doc.toString() === draft.text) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: draft.text },
      selection: { anchor: Math.min(draft.caret, draft.text.length) },
      annotations: FROM_DRAFT.of(true),
    })
  }, [draft.text, draft.caret])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: PLACEHOLDER.reconfigure(placeholderExtension(placeholder)),
    })
  }, [placeholder])

  return <div ref={hostRef} className={styles["markdown-editor"]} />
}

/** 外の下書きを書き写した変更。`onChange` へ返すと往復になるので、印を付けて見分ける。 */
const FROM_DRAFT = Annotation.define<boolean>()

/** 質問の間だけ差し替わるプレースホルダ。 */
const PLACEHOLDER = new Compartment()

/**
 * 既定の keymap から `Mod-Enter`（空行を挟む）を外したもの。
 * 送信の判定が変換中などで送らなかったときに、空行だけが入るのを防ぐ。
 */
const EDITOR_KEYMAP = defaultKeymap.filter((binding) => binding.key !== "Mod-Enter")

/** 構文木の節に class だけを付ける。見た目は CSS に書く。 */
const MARKDOWN_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.heading1, class: styles["markdown-heading-1"] },
  { tag: tags.heading2, class: styles["markdown-heading-2"] },
  { tag: tags.heading3, class: styles["markdown-heading-3"] },
  { tag: [tags.heading4, tags.heading5, tags.heading6], class: styles["markdown-heading"] },
  { tag: tags.strong, class: styles["markdown-strong"] },
  { tag: tags.emphasis, class: styles["markdown-emphasis"] },
  { tag: tags.strikethrough, class: styles["markdown-strikethrough"] },
  { tag: tags.monospace, class: styles["markdown-code"] },
  { tag: [tags.link, tags.url], class: styles["markdown-link"] },
  { tag: tags.quote, class: styles["markdown-quote"] },
  { tag: tags.processingInstruction, class: styles["markdown-mark"] },
])
