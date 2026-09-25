// 訪問の台本を作る口（`docs/design.md` 5章「訪問の台本」）。材料（2人の人格と表情・今日の成果・
// 時刻）を集め、使い捨ての `query()`（`src/server/visit/adapter/sdk-visit-script.ts`）に書かせ、受け取った
// ものを検査して**「作れた」か「作れなかった」の2つに畳む**。作れなかったときにどの台本へ
// 落とすかは見張り（`visit-watch.ts`）が決める。
//
// **作る口は決して reject しない**（起こせない・中断・形の崩れはどれも `failed`）。常駐プロセスは
// 台本1本の失敗で落ちない。時間切れと帰る合図での中断は見張りが `signal` で伝える。
//
// 材料も台本も会話の内容に当たる。メモリにだけ持ち、ログにもファイルにも書かない
// （docs/coding-standards.md「会話内容の扱い」）。

import { type DailyAchievement } from "../../../shared/achievement.ts"
import { type VisitScript } from "../../../shared/character-visit.ts"
import {
  parseVisitScript,
  type VisitCastLookup,
  type VisitScriptQuery,
  visitScriptQuery,
  type VisitWorkExcerpt,
} from "./visit-script.ts"

/** 見張りが来ると決めた時点で渡す、台本の注文。 */
export type VisitScriptDraft = {
  /** あるじと客のパック名。 */
  readonly host: string
  readonly guest: string
  readonly excerpt: VisitWorkExcerpt
  /** 待ち始めてからの長さ（ミリ秒）。 */
  readonly waitedMs: number
}

/** 作れたか、作れなかったか（理由は問わない。どれも落とし先へ回る）。 */
export type VisitScriptOutcome =
  | { readonly kind: "written"; readonly script: VisitScript }
  | { readonly kind: "failed" }

/** 台本を1本作る。`signal` が中断されたら、待たずに `failed` で返る。 */
export type VisitScriptWriter = (
  draft: VisitScriptDraft,
  signal: AbortSignal,
) => Promise<VisitScriptOutcome>

/**
 * 台本の出どころ。
 *
 * - `pack-only`: 作らず、パックに書いた台本だけを使う（疑似セッション。claude を起こさない）
 * - `write`: その場で作り、作れなかったらパックの台本へ落とす
 */
export type VisitScriptSource =
  | { readonly kind: "pack-only" }
  | { readonly kind: "write"; readonly write: VisitScriptWriter }

/** 作る口に外の世界から渡すもの（配線は `src/session-start.ts`）。 */
export type VisitScriptWriterPorts = {
  /** あるじと客の人格と表情（パックの一覧を読む）。 */
  readonly readCast: (host: string, guest: string) => VisitCastLookup
  /** 今日の成果。読めなければ `unknown` に畳んで返す。 */
  readonly readAchievement: () => Promise<DailyAchievement>
  /** いまのローカル時刻（`HH:MM`）。 */
  readonly localTime: () => string
  /** 使い捨ての `query()`。返すのは `structured_output` のまま（検査はここでする）。 */
  readonly query: (query: VisitScriptQuery, signal: AbortSignal) => Promise<unknown>
}

const FAILED = { kind: "failed" } as const satisfies VisitScriptOutcome

export function createVisitScriptWriter(ports: VisitScriptWriterPorts): VisitScriptWriter {
  return (draft, signal) => Promise.race([write(ports, draft, signal), abortion(signal)])
}

async function write(
  ports: VisitScriptWriterPorts,
  draft: VisitScriptDraft,
  signal: AbortSignal,
): Promise<VisitScriptOutcome> {
  const lookup = ports.readCast(draft.host, draft.guest)
  if (lookup.kind === "missing") {
    return FAILED
  }
  try {
    const achievement = await ports.readAchievement()
    const query = visitScriptQuery({
      cast: lookup.cast,
      excerpt: draft.excerpt,
      waitedMs: draft.waitedMs,
      localTime: ports.localTime(),
      achievement,
    })
    const script = parseVisitScript(await ports.query(query, signal), lookup.cast)
    return script === undefined ? FAILED : { kind: "written", script }
  } catch {
    // 起こせない・中断・API の失敗。理由はどれも落とし先へ回るだけなので分けない。
    return FAILED
  }
}

/** `signal` が中断されたら `failed` で返る（口が中断を無視しても待たない）。 */
function abortion(signal: AbortSignal): Promise<VisitScriptOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(FAILED)
      return
    }
    signal.addEventListener(
      "abort",
      () => {
        resolve(FAILED)
      },
      { once: true },
    )
  })
}
