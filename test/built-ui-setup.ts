// E2E を直に流しても、古い `dist/browser/` のままテストを走らせない。

import { assertBuiltUiFresh } from "../scripts/dev/lib/built-ui-freshness.ts"
import { builtUiDir } from "../src/server/view-server/adapter/build/bundle.ts"

export default function setup(): Promise<void> {
  return assertBuiltUiFresh(builtUiDir())
}
