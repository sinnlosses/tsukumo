// 新しい器の紙の根。頭（判定の行・結論と補い・前回から・あなたの番・続けて頼めること）を先に置き、主要な数・確かさ・本文の節・置いた前提・出どころを続ける。
// 何を出すかは紙の形（`paperFormOf`）で絞る。
// 書き上げの演出は根の直下の子を読むので、欄は入れ子にせず根の直下に並べる。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { ReportProgress } from "../../../../shared/report/report-progress-field.ts"
import type { MainViewSurfaceHead } from "../../../../shared/session/main-view-shape.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { characterFaceInfo } from "../../../domain/character-face.ts"
import {
  READING_DEPTHS,
  type ReadingDepth,
  useReadingDepth,
} from "../../../stores/reading-depth.ts"
import { useSession } from "../../../stores/session.ts"
import { BodyRegions, useReport } from "../a2ui-part.tsx"
import { certaintyLedgerOf } from "../domain/certainty-ledger.ts"
import { type GuideNoteField, guideLeafIdsOf } from "../domain/guide-note-target.ts"
import { type PaperForm, paperFormOf } from "../domain/paper-form.ts"
import { splitConclusion } from "../domain/split-conclusion.ts"
import { RegionBox, ReportFrame } from "../leaf/body-region.tsx"
import { CertaintyLedger } from "../leaf/certainty-ledger.tsx"
import { GuideNoteFrame, GuideNoteScope } from "../leaf/guide-note-list.tsx"
import { StatCards } from "../leaf/stats-leaf.tsx"
import { checksClassName, InlineMarkdown, statsLeafClassNames } from "../markdown.tsx"
import { PaperContext } from "./paper-context.ts"
import { PaperStamp } from "./paper-stamp.tsx"
import { PaperTurn } from "./paper-turn.tsx"
import styles from "./paper.module.css"

export function PaperReportRoot(): ReactElement {
  const report = useReport()
  const { view } = report
  const { head } = view
  const { progress } = head
  const form = paperFormOf({
    progress,
    components: view.components,
    changedFiles: head.finalStatus.changedFiles,
    checks: head.checks,
    sectionCount: Object.keys(view.sections).length,
  })
  const full = form !== "answer"
  const depth = useReadingDepth((state) => state.depth)
  const ledger = certaintyLedgerOf(head.checks, view.components)
  const hasLedgerRows = Object.values(ledger.counts).some((count) => count > 0)
  const character = useSession((session) => session.state.character)
  const fields = new Set<GuideNoteField>([
    "head",
    ...(form === "deliver" && head.keyFigures.length > 0 ? (["figures"] as const) : []),
    ...(full && hasLedgerRows ? (["ledger"] as const) : []),
  ])
  return (
    <PaperContext value={true}>
      <ReportFrame
        reveal={report.reveal}
        turnId={report.turnId}
        className={clsx(report.className, styles["paper"])}
        revealClassName={report.revealClassName}
        blockClassName={report.blockClassName}
        depth={depth}
      >
        <GuideNoteScope
          notes={progress.guideNotes}
          targets={{ componentIds: new Set(report.parts.keys()), fields }}
          leafIdsOf={(id) => guideLeafIdsOf(report.parts, id)}
          face={characterFaceInfo(character)}
        >
          <GuideNoteFrame field="head">
            <RegionBox region={{ kind: "head" }}>
              <div className={styles["paper-head"]} data-paper-form={form}>
                <div className={styles["paper-top"]}>
                  <PaperStamp form={form} head={head} counts={ledger.counts} />
                  <DepthSwitch depth={depth} />
                </div>
                <Conclusion lead={head.lead} />
                {progress.previous.kind === "previous" && <Previous previous={progress.previous} />}
                <PaperTurn
                  form={form}
                  next={progress.next}
                  components={view.components}
                  nextSteps={report.nextSteps}
                />
              </div>
            </RegionBox>
          </GuideNoteFrame>
          {fields.has("figures") && (
            <GuideNoteFrame field="figures">
              <div className={statsLeafClassNames.keyFigures} data-paper-part="figures">
                <StatCards items={head.keyFigures} />
              </div>
            </GuideNoteFrame>
          )}
          {fields.has("ledger") && (
            <GuideNoteFrame field="ledger">
              <div className={checksClassName("status")} data-paper-part="ledger">
                <CertaintyLedger ledger={ledger} depth={depth} />
              </div>
            </GuideNoteFrame>
          )}
          <BodyRegions foldable={true} />
        </GuideNoteScope>
        {full && progress.assumptions.length > 0 && (
          <Assumptions assumptions={progress.assumptions} />
        )}
        {progress.sources.length > 0 && <Sources sources={progress.sources} form={form} />}
      </ReportFrame>
    </PaperContext>
  )
}

/** 読む深さの切り替え。深さは部屋に1つなので、どの紙で替えても同じ部屋の紙がそろって替わる。 */
function DepthSwitch(props: { readonly depth: ReadingDepth }): ReactElement {
  const setDepth = useReadingDepth((state) => state.setDepth)
  return (
    <div className={styles["paper-depth"]} role="group" aria-label="読む深さ">
      {READING_DEPTHS.map((option) => (
        <Button
          key={option.depth}
          variant="ghost"
          size="label"
          pressed={option.depth === props.depth ? "on" : "off"}
          disabled={false}
          disclosure={{ kind: "none" }}
          className=""
          onClick={() => setDepth(option.depth)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

/** 結論の1文目を大きく、2文目以降を補いの1段として描く。 */
function Conclusion(props: { readonly lead: MainViewSurfaceHead["lead"] }): ReactElement {
  if (props.lead.kind === "none") {
    return <></>
  }
  const { first, rest } = splitConclusion(props.lead.text)
  return (
    <>
      <p className={styles["paper-conclusion"]}>
        <InlineMarkdown text={first} />
      </p>
      {rest.trim() !== "" && (
        <p className={styles["paper-sub"]}>
          <InlineMarkdown text={rest.trim()} />
        </p>
      )}
    </>
  )
}

const PREVIOUS_GROUPS = [
  { key: "resolved", tone: "ok", mark: "✓", word: "解決" },
  { key: "added", tone: "ng", mark: "✕", word: "新しく" },
  { key: "remaining", tone: "unknown", mark: "？", word: "残っている" },
] as const

function Previous(props: {
  readonly previous: Extract<ReportProgress["previous"], { readonly kind: "previous" }>
}): ReactElement {
  return (
    <div className={styles["paper-previous"]} role="group" aria-label="前回から">
      {PREVIOUS_GROUPS.map((group) => {
        const items = props.previous[group.key]
        return (
          items.length > 0 && (
            <section key={group.key}>
              <h3 className={styles["paper-previous-heading"]} data-tone={group.tone}>
                {`${group.mark} ${group.word} ― ${String(items.length)}件`}
              </h3>
              <ul>
                {items.map((item) => (
                  <li key={item}>
                    <InlineMarkdown text={item} />
                  </li>
                ))}
              </ul>
            </section>
          )
        )
      })}
    </div>
  )
}

function Assumptions(props: { readonly assumptions: readonly string[] }): ReactElement {
  return (
    <div data-paper-part="assumptions">
      <h4>置いた前提</h4>
      <ul>
        {props.assumptions.map((assumption) => (
          <li key={assumption}>
            <InlineMarkdown text={assumption} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sources(props: {
  readonly sources: ReportProgress["sources"]
  readonly form: PaperForm
}): ReactElement {
  return (
    <div
      className={styles["paper-sources"]}
      data-paper-part={props.form === "answer" ? "answer-sources" : "sources"}
    >
      <h4>出どころ</h4>
      <ol>
        {props.sources.map((source) => (
          <li key={source.mark} value={source.mark}>
            <code>{source.place}</code>
            {source.note !== undefined && ` ${source.note}`}
          </li>
        ))}
      </ol>
    </div>
  )
}
