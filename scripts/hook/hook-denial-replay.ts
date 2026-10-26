// log-only で走らせた hook が「拒むはずだった形」を、記録から一覧する。
// 使い方: node scripts/hook/hook-denial-replay.ts [--days N]（既定 7）
// 記録にコマンドの全文は無いので、形は hook の名前と規則のキーで出す。
// 規則のキーごとに、件数・呼び手の内訳・最初と最後の時刻を並べる。

import process from "node:process"

import { countBy, groupBy } from "remeda"

import { readHookDenials, type RecordedHookDenial } from "./lib/hook-denial-record.ts"
import { readDays } from "./lib/read-period.ts"

const DEFAULT_DAYS = 7

const days = readDays(process.argv.slice(2), DEFAULT_DAYS)
const since = Temporal.Now.instant().subtract({ hours: days * 24 })
const records = readHookDenials(since).filter((denial) => denial.logOnly)

process.stdout.write(formatReplay(records, days))

function formatReplay(logOnly: readonly RecordedHookDenial[], periodDays: number): string {
  if (logOnly.length === 0) {
    return `直近 ${periodDays} 日に、log-only で拒むはずだった形はない\n`
  }
  const lines = Object.entries(groupBy(logOnly, (denial) => `${denial.hook} ${denial.rule}`)).map(
    ([key, group]) => {
      const actors = countBy(group, (denial) => denial.actor)
      const breakdown = Object.entries(actors)
        .map(([actor, count]) => `${actor} ${count}`)
        .join(" / ")
      const times = group.map((denial) => denial.at).toSorted()
      return `${key}: ${group.length}（${breakdown}）${times[0]} 〜 ${times.at(-1)}`
    },
  )
  return `直近 ${periodDays} 日に、log-only で拒むはずだった形\n${lines.join("\n")}\n`
}
