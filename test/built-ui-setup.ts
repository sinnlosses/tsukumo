// E2E を直に流しても、古い `dist/browser/` のままテストを走らせない。

import { assertBuiltUiFresh } from "../scripts/lib/built-ui-freshness.ts"
import { builtUiDir } from "../src/server/view-server/adapter/bundle.ts"

export default function setup(): Promise<void> {
  return assertBuiltUiFresh(builtUiDir())
}
