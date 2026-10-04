// 握りつぶした失敗を診断ログへ書く口。
// `diagnostic` を import できない機能（chat・recommendation）の失敗は、配線がここ越しに書く。

import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import {
  type SwallowedFailurePlace,
  swallowedFailureFootprint,
} from "../shared/diagnostic/swallowed-failure.ts"

export function failureDiagnostic(
  log: DiagnosticLog,
  now: () => number,
): (place: SwallowedFailurePlace, error: unknown) => void {
  return (place, error) => {
    log.append([swallowedFailureFootprint(now(), place, error)])
  }
}
