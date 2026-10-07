// 入力欄のマークダウンエディタの面（CodeMirror）。
// Markdown の構文木に沿って字の大きさ・太さ・色・等幅を付け、キャレットの無い行の記号は隠す。
// キャレット（選択範囲）の行は記号を残したまま置き換えない。
// 変換中の IME はその行にしか居ず、その行の DOM の形を変えると確定を壊しうる。
//
// 面の上に書式のボタンの行を持ち、範囲を選んで URL を貼ると選んだ字をリンクにする。
//
// 下書きの持ち主はこの外にある。
// 打った結果は `onChange` で外へ返し、外で変わった下書き（補完の確定・送信後の空）は文面が違うときだけ書き写す。

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdownLanguage } from "@codemirror/lang-markdown"
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language"
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  StateField,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type ReactElement,
  type Ref,
} from "react"

import type { Draft } from "../../../../../../../stores/composer-draft.ts"
import type {
  ComposerKey,
  ComposerSurface,
  ComposerSurfaceHandlers,
} from "../../domain/composer-surface.ts"
import { FormatBar, type FormatBarProps } from "../format-bar/format-bar.tsx"
import { linkedPaste } from "./domain/markdown-link-paste.ts"
import { concealedMarks, type ConcealedMark } from "./domain/markdown-mark-concealment.ts"
import styles from "./markdown-editor-surface.module.css"

export type MarkdownEditorSurfaceProps = ComposerSurfaceHandlers & {
  readonly ref: Ref<ComposerSurface | null>
  readonly draft: Draft
  readonly placeholder: string
  readonly label: string
}

export function MarkdownEditorSurface({
  ref,
  draft,
  placeholder,
  label,
  onChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
}: MarkdownEditorSurfaceProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const initialDraft = useEffectEvent(() => ({ draft, placeholder, label }))
  const changed = useEffectEvent((next: Draft) => {
    onChange(next)
  })
  const keyDown = useEffectEvent((key: ComposerKey) => onKeyDown(key))
  const paste = useEffectEvent((event: ClipboardEvent) => {
    onPaste(event)
  })
  const format: FormatBarProps["onFormat"] = useEffectEvent((makeEdit) => {
    const view = viewRef.current
    if (view === null) {
      return
    }
    const { from, to } = view.state.selection.main
    const edit = makeEdit({ text: view.state.doc.toString(), from, to })
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: EditorSelection.single(edit.anchor, edit.head),
      userEvent: "input",
    })
    view.focus()
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
                  shiftKey: event.shiftKey,
                  keyCode: event.keyCode,
                  isComposing: event.isComposing,
                  preventDefault: () => {
                    event.preventDefault()
                  },
                }),
              // 画像を取ったときだけ `preventDefault` されるので、そのときだけ字の挿入へ流さない。
              paste: (event, pastedView) => {
                paste(event)
                if (event.defaultPrevented) {
                  return true
                }
                return pasteAsLink(event, pastedView)
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
          MARK_CONCEALMENT,
          EditorView.lineWrapping,
          EditorView.editorAttributes.of({ class: styles["markdown-editor-view"] }),
          PLACEHOLDER.of(placeholderExtension(initial.placeholder)),
          LABEL.of(EditorView.contentAttributes.of({ "aria-label": initial.label })),
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

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: LABEL.reconfigure(EditorView.contentAttributes.of({ "aria-label": label })),
    })
  }, [label])

  return (
    <div className={styles["markdown-editor-surface"]}>
      <FormatBar onFormat={format} />
      <div ref={hostRef} className={styles["markdown-editor"]} />
    </div>
  )
}

/** 範囲を選んで URL を貼ったときだけ、選んだ字をリンクにして貼り付けを済ませる。 */
function pasteAsLink(event: ClipboardEvent, view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const pasted = linkedPaste(
    view.state.sliceDoc(from, to),
    event.clipboardData?.getData("text/plain") ?? "",
  )
  if (pasted.kind === "plain") {
    return false
  }
  event.preventDefault()
  view.dispatch({
    changes: { from, to, insert: pasted.text },
    selection: { anchor: from + pasted.text.length },
    userEvent: "input.paste",
  })
  return true
}

/** 外の下書きを書き写した変更。`onChange` へ返すと往復になるので、印を付けて見分ける。 */
const FROM_DRAFT = Annotation.define<boolean>()

/** 質問の間だけ差し替わるプレースホルダ。 */
const PLACEHOLDER = new Compartment()

/** 質問の間だけ差し替わる入力欄の名前。 */
const LABEL = new Compartment()

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

/** キャレットの無い行の記号を隠す。文面・選択・構文木のどれかが変わったときだけ付け直す。 */
const MARK_CONCEALMENT = StateField.define<DecorationSet>({
  create: (state) => concealmentDecorations(state),
  update: (decorations, transaction) =>
    transaction.docChanged ||
    transaction.selection !== undefined ||
    syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? concealmentDecorations(transaction.state)
      : decorations,
  provide: (field) => EditorView.decorations.from(field),
})

function concealmentDecorations(state: EditorState): DecorationSet {
  return Decoration.set(concealedMarks(state).map(decorationOf), true)
}

function decorationOf(mark: ConcealedMark): ReturnType<Decoration["range"]> {
  switch (mark.kind) {
    case "hidden":
      return Decoration.replace({}).range(mark.from, mark.to)
    case "bullet":
      return Decoration.replace({ widget: BULLET }).range(mark.from, mark.to)
    case "link-label":
      return Decoration.mark({ attributes: { title: mark.url } }).range(mark.from, mark.to)
    case "quote-line":
      return Decoration.line({ class: styles["markdown-quote-line"] }).range(mark.from)
  }
}

/** 箇条書きの印（`-`・`*`・`+`）の代わりに出す `•`。 */
class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement("span")
    bullet.className = styles["markdown-bullet"]
    bullet.textContent = "•"
    return bullet
  }
}

const BULLET = new BulletWidget()
