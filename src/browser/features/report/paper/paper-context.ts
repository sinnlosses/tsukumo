// 紙の根（`PaperReportRoot`）の中で描いているかどうか。注意の5つの調子の出し分けが、紙の中と外で分かれる。

import { createContext } from "react"

export const PaperContext = createContext(false)
