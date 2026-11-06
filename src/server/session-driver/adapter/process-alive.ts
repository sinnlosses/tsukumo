// 「pid のプロセスが生きているか」を見る判定をここに1つだけ持つ。

import process from "node:process"

import { hasErrorCode } from "../../core/utils/error-code.ts"

/**
 * シグナル 0 は送らずに届くかどうかだけを見る。
 * 別の利用者のプロセス（`EPERM`）は権限が無いだけで生きている。それ以外の失敗（`ESRCH` ほか）は死んでいる。
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return hasErrorCode(error, "EPERM")
  }
}
