// 面の頭（結論・数のカード・合図の行・段ごとの所要時間・変更したファイル）とお願いを、欄の Markdown を通さずに描く。
// 頭はどの部分も値から、お願いは本文の塊を包みの中に並べる。

import clsx from "clsx"
import { type ReactElement, type RefCallback, use, useState } from "react"

import type { ReportNotDoneView } from "../../../../shared/report/report-not-done.ts"
import { REPORT_NOTE_KINDS } from "../../../../shared/report/report-notation.ts"
import type { MainViewSurfaceHead } from "../../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../../shared/utils/blank-text.ts"
import { type FavorOption, hasIrreversibleOption } from "../domain/favor-option-list.ts"
import type { ReportProofView } from "../domain/report-proof.ts"
import { splitConclusion } from "../domain/split-conclusion.ts"
import {
  checksClassName,
  InlineMarkdown,
  NoteLabel,
  noteLeafClassNames,
  statsLeafClassNames,
  textLeafClassNames,
} from "../markdown.tsx"
import { ReplyPortContext } from "../reply-port.ts"
import { RegionBox, RegionChunks } from "./body-region.tsx"
import { ChangedFilesFold } from "./changed-files-fold.tsx"
import { ChecksVerdict } from "./checks-verdict.tsx"
import favorStyles from "./favor-option.module.css"
import { PhaseTimes } from "./phase-time-section.tsx"
import proofStyles from "./proof-band.module.css"
import { StatCards } from "./stats-leaf.tsx"
import { WorkRecord } from "./work-record.tsx"

/** 頭の欄。結論・数のカード・合図の行・段ごとの所要時間・変更したファイルのどれも無ければ何も描かない。 */
export function HeadRegion(props: {
  readonly head: MainViewSurfaceHead
  /** 検証の行と節の結びつき。無ければ帯は出ない。 */
  readonly proof?: ReportProofView
}): ReactElement {
  const { lead, keyFigures, checks, status } = props.head
  const { proof } = props
  const { phaseTimes, changedFiles } = status
  const hasStatus =
    checks.kind === "checks" || phaseTimes.kind !== "none" || changedFiles.kind !== "none"
  const hasRecord =
    lead.kind === "conclusion" &&
    (hasStatus || status.verification.kind === "checked" || !isBlankText(props.head.workDone))
  if (lead.kind === "none" && keyFigures.length === 0 && !hasStatus) {
    return <></>
  }
  return (
    <RegionBox region={{ kind: "head" }}>
      {lead.kind !== "none" && (
        <div
          className={
            lead.kind === "conclusion"
              ? textLeafClassNames.conclusion
              : textLeafClassNames.conclusionLead
          }
        >
          <ConclusionText text={lead.text} split={lead.kind === "conclusion"} />
        </div>
      )}
      {keyFigures.length > 0 && (
        <div className={statsLeafClassNames.keyFigures}>
          <StatCards items={keyFigures} />
        </div>
      )}
      {hasRecord && <WorkRecord head={props.head} proof={proof} />}
      {hasStatus && !hasRecord && (
        <div className={checksClassName("status")}>
          {checks.kind === "checks" && <ChecksVerdict view={checks} proof={proof} />}
          {phaseTimes.kind === "times" && <PhaseTimes view={phaseTimes} />}
          {changedFiles.kind === "files" && (
            <ChangedFilesFold
              view={changedFiles}
              {...(status.map === undefined ? {} : { map: status.map })}
            />
          )}
        </div>
      )}
    </RegionBox>
  )
}

/** お願いの欄。本文が空なら何も描かない。`id` は合図の行の印が飛ぶ先。 */
export function FavorRegion(props: {
  readonly id: string
  readonly text: string
  readonly favorRef?: RefCallback<HTMLElement>
  readonly options: readonly FavorOption[]
  /** 札を押して下書きを入れられるか。最新のやり取りの最終レポートだけ。 */
  readonly pressable: boolean
}): ReactElement {
  if (isBlankText(props.text)) {
    return <></>
  }
  const label = REPORT_NOTE_KINDS.find(([name]) => name === "note-favor")?.[1] ?? ""
  return (
    <RegionBox region={{ kind: "favor", id: props.id }} favorRef={props.favorRef}>
      <div className={clsx(noteLeafClassNames.note, noteLeafClassNames.noteFavor)}>
        <NoteLabel kindName="note-favor" label={label} />
        <RegionChunks markdown={props.text} />
        {props.options.length > 0 && (
          <FavorChoices options={props.options} pressable={props.pressable} />
        )}
      </div>
    </RegionBox>
  )
}

/** やっていないことの欄。省いたレポートは欄ごと描かず、空の並びは「無い」と1行で言う。 */
export function NotDoneRegion(props: { readonly notDone: ReportNotDoneView }): ReactElement {
  const { notDone } = props
  if (notDone.kind === "omitted") {
    return <></>
  }
  return (
    <RegionBox region={{ kind: "not-done" }}>
      <h4>やっていないこと</h4>
      {notDone.items.length === 0 ? (
        <p>無い</p>
      ) : (
        <ul className={proofStyles["not-done-list"]}>
          {notDone.items.map((item, index) => (
            <li key={`${String(index)}:${item}`}>
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>
      )}
    </RegionBox>
  )
}

function FavorChoices(props: {
  readonly options: readonly FavorOption[]
  readonly pressable: boolean
}): ReactElement {
  const slot = use(ReplyPortContext)
  const [chosen, setChosen] = useState("")
  const port = props.pressable && slot.kind === "open" ? slot.port : undefined
  return (
    <div className={favorStyles["favor-options"]}>
      {hasIrreversibleOption(props.options) && (
        <p role="note" className={favorStyles.warn}>
          戻せない操作を含む選択肢があります。わけは上のお願いの本文に書いてあります。
        </p>
      )}
      <ul className={favorStyles.choices}>
        {props.options.map((option) => (
          <li key={option.name} className={favorStyles.item}>
            {port === undefined ? (
              <div className={favorStyles.choice}>
                <ChoiceBody option={option} />
              </div>
            ) : (
              <button
                type="button"
                className={favorStyles.choice}
                aria-pressed={chosen === option.name}
                onClick={() => {
                  port.appendDraft(option.draft)
                  setChosen(option.name)
                }}
              >
                <ChoiceBody option={option} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChoiceBody(props: { readonly option: FavorOption }): ReactElement {
  const { option } = props
  return (
    <>
      <span className={favorStyles.name}>
        {option.name}
        {option.recommended === true && <span className={favorStyles.recommended}>おすすめ</span>}
      </span>
      {option.result !== undefined && option.result !== "" && (
        <span className={favorStyles.result}>{option.result}</span>
      )}
    </>
  )
}

/** 結論の文。`split` なら1文目を大きく、2文目以降を控えめに描く（本文の文字列は割る前と同じ）。 */
function ConclusionText(props: { readonly text: string; readonly split: boolean }): ReactElement {
  const { first, rest } = props.split
    ? splitConclusion(props.text)
    : { first: props.text, rest: "" }
  return (
    <p>
      {props.split ? (
        <span className={textLeafClassNames.conclusionFirst}>
          <InlineMarkdown text={first} />
        </span>
      ) : (
        <InlineMarkdown text={first} />
      )}
      {rest !== "" && (
        <span className={textLeafClassNames.conclusionRest}>
          <InlineMarkdown text={rest} />
        </span>
      )}
    </p>
  )
}
