// 面が作れなかった本文。頭とお願いは値から描き、節の代わりに「本文を描けなかった」の印を出す。
// 原因は診断ログへ送る（運ぶのは経路・`error.name`・スタックの先頭数フレームだけで、本文は入らない）。

import type { ReactElement } from "react"

import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { reportBrowserError } from "../../stores/browser-error-report.ts"
import type { A2uiReportProps } from "./a2ui-surface-model.ts"
import { ReportFrame } from "./leaf/body-region.tsx"
import { FavorFollowUp } from "./leaf/favor-follow-up.tsx"
import { NoteBody } from "./leaf/note-leaf.tsx"
import { HeadRegion } from "./leaf/report-head-region.tsx"

export function FailedReport(props: A2uiReportProps & { readonly error: unknown }): ReactElement {
  const { view, error } = props
  useExternalSync(() => {
    reportBrowserError("render-failure", error)
  }, [error])
  return (
    <ReportFrame
      reveal={props.reveal}
      turnId={props.turnId}
      className={props.className}
      revealClassName={props.revealClassName}
      blockClassName={props.blockClassName}
    >
      <HeadRegion head={view.head} />
      <NoteBody tone="ng" text="本文を描けませんでした。" />
      <FavorFollowUp
        favor={view.favor}
        components={view.components}
        favorRef={props.favorRef}
        pressable={props.favorPressable}
      />
    </ReportFrame>
  )
}
