// WebFetch ツールの PreToolUse で走り、サブエージェントが許可リストの外のホストを読む形を拒否として扱う入口。
// 判定に失敗したときは通す。

import { denyHookCall, readWebFetchHookCall } from "./lib/hook-input.ts"
import { findWebFetchHostDenial } from "./lib/web-fetch-host.ts"

const call = await readWebFetchHookCall()
if (call !== undefined) {
  const denial = findWebFetchHostDenial(call)
  if (denial !== undefined) {
    denyHookCall(call, denial)
  }
}
