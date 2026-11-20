// 背景の暗さ・パネルのぼかし・パネルの濃さを `:root` のトークンへ差す。差す内容の判断は `appearance-adjust`。

import type { AppearanceAdjust } from "../../shared/session/gear-preference.ts"
import { appearanceAdjustTokenWrites } from "../domain/appearance-adjust.ts"

/** `:root` に反映する。動かしていない背景の暗さはトークンを外し、パックの値へ戻る。 */
export function applyAppearanceAdjust(value: AppearanceAdjust): void {
  for (const write of appearanceAdjustTokenWrites(value)) {
    if (write.value === undefined) {
      document.documentElement.style.removeProperty(write.name)
    } else {
      document.documentElement.style.setProperty(write.name, write.value)
    }
  }
}
