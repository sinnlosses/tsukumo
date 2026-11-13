// 書き手が渡した案内の付箋（顔と一言）を、指された場所の欄外に出す。
// 部品の付箋は部品の外枠（`AskFrame`）の欄外に、紙の欄（頭・確かさ・主要な数）の付箋は `GuideNoteFrame` が欄の横に出す。
// 狭い幅では欄外の列が無いので、指された所のすぐ下に左の細い線つきで出す。
// 描く付箋の数と置き場は `drawnGuideNotes` が決め、この部品は渡された字を描くだけ。

import clsx from "clsx"
import { createContext, type ReactElement, type ReactNode, use } from "react"

import type { ReportGuideNote } from "../../../../shared/report/report-progress-field.ts"
import type { CharacterFaceInfo } from "../../../domain/character-face.ts"
import {
  drawnGuideNotes,
  type GuideNoteField,
  type GuideNoteTargets,
} from "../domain/guide-note-target.ts"
import { LeafIdentityContext } from "../leaf-point-context.ts"
import { ReplyPointContext } from "../reply-point.tsx"
import styles from "./guide-note.module.css"
import leafStyles from "./leaf.module.css"
import type { MarginTops } from "./reply-unit-dom.ts"

type GuideNoteSet = {
  /** 内容部品の ID ごとの付箋の字。 */
  readonly byLeaf: ReadonlyMap<string, readonly string[]>
  readonly byField: ReadonlyMap<GuideNoteField, readonly string[]>
  readonly face: CharacterFaceInfo
}

const NO_GUIDE_NOTES: GuideNoteSet = { byLeaf: new Map(), byField: new Map(), face: { alt: "" } }

const GuideNoteContext = createContext<GuideNoteSet>(NO_GUIDE_NOTES)

/** 描くと決めた付箋を、内容部品と紙の欄ごとに束ねて配る。`leafIdsOf` は部品の ID を、付箋を置く内容部品の ID（あれば1つ）に解く。 */
export function GuideNoteScope(props: {
  readonly notes: readonly ReportGuideNote[]
  readonly targets: GuideNoteTargets
  readonly leafIdsOf: (componentId: string) => readonly string[]
  readonly face: CharacterFaceInfo
  readonly children: ReactNode
}): ReactElement {
  const byLeaf = new Map<string, string[]>()
  const byField = new Map<GuideNoteField, string[]>()
  for (const note of drawnGuideNotes(props.notes, props.targets)) {
    if (note.place.kind === "field") {
      byField.set(note.place.field, [...(byField.get(note.place.field) ?? []), note.text])
      continue
    }
    for (const leafId of props.leafIdsOf(note.place.id)) {
      byLeaf.set(leafId, [...(byLeaf.get(leafId) ?? []), note.text])
    }
  }
  return (
    <GuideNoteContext value={{ byLeaf, byField, face: props.face }}>
      {props.children}
    </GuideNoteContext>
  )
}

/** いまの内容部品に置く付箋。部品の外枠が欄外か直下に出す。 */
export function useLeafGuideNotes(): {
  readonly texts: readonly string[]
  readonly face: CharacterFaceInfo
} {
  const set = use(GuideNoteContext)
  const leaf = use(LeafIdentityContext)
  return {
    texts: leaf.kind === "leaf" ? (set.byLeaf.get(leaf.componentId) ?? []) : [],
    face: set.face,
  }
}

/** 欄外の付箋と同じ高さの「聞く・頼む」を、付箋の下へ下げる。外枠に欄外の付箋が無ければ変えない。 */
export function clearGuideCard(tops: MarginTops, frame: HTMLElement): MarginTops {
  const card = frame.querySelector<HTMLElement>("[data-margin-card][data-guide-card]")
  if (card === null) {
    return tops
  }
  return { ...tops, pointed: Math.max(tops.pointed, card.offsetTop + card.offsetHeight + 8) }
}

/** 欄外の列の中の付箋。上端は外枠の上端で、前の札と重なる分の下へのずらしは本文の根が測って渡す。 */
export function GuideNoteMargin(props: {
  readonly id: string
  readonly texts: readonly string[]
  readonly face: CharacterFaceInfo
  readonly shift: number
}): ReactElement {
  return (
    <div
      className={clsx(styles["guide-note"], styles["guide-note-margin"])}
      data-margin-card={props.id}
      data-card-top={0}
      data-guide-card=""
      style={{ top: `${String(props.shift)}px` }}
    >
      <GuideNoteRows texts={props.texts} face={props.face} />
    </div>
  )
}

/** 狭い幅の付箋。指された所のすぐ下に出す。 */
export function GuideNoteInline(props: {
  readonly texts: readonly string[]
  readonly face: CharacterFaceInfo
}): ReactElement {
  return (
    <div className={clsx(styles["guide-note"], styles["guide-note-inline"])} data-guide-card="">
      <GuideNoteRows texts={props.texts} face={props.face} />
    </div>
  )
}

/** 紙の欄（頭・確かさ・主要な数）の横に付箋を出す。付箋が無い欄は子をそのまま返す。 */
export function GuideNoteFrame(props: {
  readonly field: GuideNoteField
  readonly children: ReactNode
}): ReactElement {
  const set = use(GuideNoteContext)
  const point = use(ReplyPointContext)
  const texts = set.byField.get(props.field) ?? []
  if (texts.length === 0) {
    return <>{props.children}</>
  }
  const id = `guide:${props.field}#guide`
  const narrow = point.kind === "available" && point.narrow
  const shift = point.kind === "available" ? (point.cardShifts[id] ?? 0) : 0
  return (
    <div className={leafStyles["ask-frame"]} data-guide-frame={props.field}>
      <div className={leafStyles["ask-main"]}>
        {props.children}
        {narrow && <GuideNoteInline texts={texts} face={set.face} />}
      </div>
      {!narrow && (
        <div className={leafStyles["ask-margin"]} data-reply-keep="">
          <GuideNoteMargin id={id} texts={texts} face={set.face} shift={shift} />
        </div>
      )}
    </div>
  )
}

function GuideNoteRows(props: {
  readonly texts: readonly string[]
  readonly face: CharacterFaceInfo
}): ReactElement {
  return (
    <>
      {props.texts.map((text, index) => (
        <div key={`${String(index)}:${text}`} className={styles["guide-note-row"]}>
          {props.face.url !== undefined && (
            <img className={styles["guide-note-face"]} src={props.face.url} alt={props.face.alt} />
          )}
          <p className={styles["guide-note-text"]}>{text}</p>
        </div>
      ))}
    </>
  )
}
