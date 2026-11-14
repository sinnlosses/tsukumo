// 見本帳の「画面の部品」の例。`presentational-*.tsx` ごとに、架空の props で描く関数を持つ。
// ページの根は並べない。例は部品の置き場ごとにファイルを分けて、ここで1本の一覧にする。

import { CHARACTER_EXAMPLES } from "./screen-part-example-character.tsx"
import { DISPATCH_EXAMPLES } from "./screen-part-example-dispatch.tsx"
import { INQUIRY_EXAMPLES } from "./screen-part-example-inquiry.tsx"
import { MAIN_VIEW_EXAMPLES } from "./screen-part-example-main.tsx"
import { NAV_EXAMPLES } from "./screen-part-example-nav.tsx"
import { STAGE_EXAMPLES } from "./screen-part-example-stage.tsx"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

export const SCREEN_PART_EXAMPLES: readonly ScreenPartExample[] = [
  ...NAV_EXAMPLES,
  ...STAGE_EXAMPLES,
  ...MAIN_VIEW_EXAMPLES,
  ...INQUIRY_EXAMPLES,
  ...DISPATCH_EXAMPLES,
  ...CHARACTER_EXAMPLES,
]
