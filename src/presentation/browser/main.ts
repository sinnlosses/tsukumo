// ブラウザ側スクリプトの入口。**`bun build` がここから辿って1本にまとめる**
// （`src/index.ts` の `buildBrowserScript`）。
//
// ここには**副作用（ページに対して実際に何かを始めること）だけ**を置き、仕組みは別のファイルに
// 分ける。こうしておくと、仕組みの側はテストから素直に import できる（入口を import すると
// その場でページを触り始めてしまう）。
//
// **移してくるスクリプトが増えたら、ここに1行ずつ足す。**

import { wireDispatch } from "./dispatch.ts"
import { wireLayoutResizer } from "./layout-resizer.ts"
import { wireMainTurns } from "./main-turns.ts"
import { subscribeAllRegions } from "./region-subscription.ts"
import { wireReportRenderers } from "./report-renderers.ts"
import { wireSessionInfo } from "./session-info.ts"

subscribeAllRegions()
wireLayoutResizer()
wireMainTurns()
wireReportRenderers()
wireDispatch()
wireSessionInfo()
