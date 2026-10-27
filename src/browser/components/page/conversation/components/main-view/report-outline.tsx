// やり取りの列の入口。

import type { ReactElement, ReactNode } from "react"

import { useReportOutline, type ReportOutlineProps } from "./hooks/use-report-outline.ts"
import { PresentationalReportOutline } from "./presentational-report-outline.tsx"

export function ReportOutline(
  props: ReportOutlineProps & { readonly children: ReactNode },
): ReactElement {
  return (
    <PresentationalReportOutline {...useReportOutline(props)}>
      {props.children}
    </PresentationalReportOutline>
  )
}
