// `src/ui/` を見張り、変更のたびにブラウザ側スクリプトと CSS を組み立て直す。**開発中だけ**
// 呼ばれる（`TSUKUMO_WATCH_UI`。docs/design.md 11章）。組み立てそのものは `src/adapter/bundle.ts`
// が持ち、ここは「いつ組み立て直すか」と「ブラウザに何をさせるか」だけを決める。
//
// **見張るのは `src/ui/` だけ。** `src/protocol/` はサーバ側でも畳み込みに使われていて、
// ブラウザ側だけ新しくすると両側の食い違った状態が動いてしまう（docs/design.md 11章）。
//
// **`fs.watch` を使う**のは、`src/adapter/task-summary.ts` が `develop/tasks.json` で選んだ
// ポーリングと逆に見えるが、取りこぼしの理由が違う。あちらは**ファイル1つ**を見張るので、
// 保存で inode ごと差し替わると監視が古い実体に残って鳴らなくなる。ここは**ディレクトリを
// 再帰で**見張るので、中のファイルが差し替わっても鳴る。
//
// 組み立てた結果は文字列で返すだけで、**ディスクには書かない**（bundle.ts 冒頭の 2026-09-12 決定）。

import { watch } from "node:fs"
import { extname } from "node:path"

import { type RefreshTarget } from "../protocol/frame.ts"
import { buildStyleSheet, buildUiScript } from "./bundle.ts"
import { bundledFilePath } from "./bundled-path.ts"

/** 見張る場所。tsukumo 自身の置き場所からの相対で解く（cwd に依存させない）。 */
const UI_SOURCE_DIR_RELATIVE_PATH: readonly string[] = ["src", "ui"]

/**
 * 最後の通知からこれだけ静かになってから組み立て直す。**エディタの保存1回で `fs.watch` は
 * 何度も鳴る**（macOS でも rename と change が続けて届く）ので、まとめないと同じ保存で
 * `bun build` が何本も走る。
 */
const REBUILD_DEBOUNCE_MS = 120

/**
 * 組み立て直せなかったときの見出し。**1行の定型文**で、届いた値やパスを混ぜない
 * （具体的な理由は {@link UiRebuildFailure} の `detail` に分けて持つ）。
 */
export const UI_REBUILD_FAILURE_REASON = {
  buildFailed: "ブラウザ側を組み立て直せなかった（前の版を配り続ける）",
  watchFailed: "src/ui/ を見張れなくなった（上げ直すまで反映されない）",
} as const

/** 組み立て直せなかったことの知らせ。見出しと、あるなら具体的な理由。 */
export type UiRebuildFailure = {
  /** {@link UI_REBUILD_FAILURE_REASON} のどれか。 */
  readonly reason: string
  /**
   * `bun build` が書いた理由（複数行。見張りが止まったときのように無いこともある）。
   * 中身は `BundleResult` の `reason` と同じで、**会話は通らない**（bundle.ts の型の注記）。
   */
  readonly detail: string | undefined
}

/** 組み立て直した結果。**スクリプトと CSS の両方**が揃ったときだけ届く。 */
export type Rebuilt = {
  /** ブラウザにさせること。CSS だけが変わったなら `style`（ページを読み込み直さない）。 */
  readonly target: RefreshTarget
  readonly uiScript: string
  readonly styleSheet: string
}

export type UiSourceWatchOptions = {
  readonly onRebuilt: (rebuilt: Rebuilt) => void
  /** 呼び出し側が見出しの1行と、あれば理由を続けて知らせる。 */
  readonly onFailure: (failure: UiRebuildFailure) => void
}

export type UiSourceWatcher = {
  readonly close: () => void
}

/**
 * `src/ui/` を見張り始める。**呼んだ時点では組み立て直さない**（起動時のぶんは呼び出し側が
 * すでに持っている）。
 *
 * 組み立てに失敗しても `onRebuilt` は呼ばず、**前の版が配られたまま**になる。途中まで書いた
 * コードを保存したときにページが白くならないのはこのため（docs/coding-standards.md
 * 「常駐プロセスは描画1回の失敗で落ちない」）。
 */
export function watchUiSource(options: UiSourceWatchOptions): UiSourceWatcher {
  const root = bundledFilePath(...UI_SOURCE_DIR_RELATIVE_PATH)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined = undefined
  let pendingTarget: RefreshTarget | undefined = undefined
  let building = false

  const flush = (): void => {
    const target = pendingTarget
    // 組み立て中に届いたぶんは、いま走っているものが終わってから拾う（下の finally）。
    if (target === undefined || building) {
      return
    }
    pendingTarget = undefined
    building = true
    void rebuild(target, options).finally(() => {
      building = false
      flush()
    })
  }

  const watcher = watch(root, { recursive: true }, (_event, fileName) => {
    pendingTarget = widerTarget(pendingTarget, targetFor(fileName))
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(flush, REBUILD_DEBOUNCE_MS)
    debounceTimer.unref()
  })

  // 見張りが続けられなくなっても常駐プロセスは落とさない（`error` を拾わないと throw になる）。
  watcher.on("error", () => {
    watcher.close()
    options.onFailure({ reason: UI_REBUILD_FAILURE_REASON.watchFailed, detail: undefined })
  })

  return {
    close: () => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
      }
      watcher.close()
    },
  }
}

/**
 * スクリプトと CSS の両方を組み立て直す。**片方しか変わっていなくても両方を組み立てる**
 * （どちらが変わったかは `target` の判断にだけ使い、配るものは常に揃った1組にする）。
 */
async function rebuild(target: RefreshTarget, options: UiSourceWatchOptions): Promise<void> {
  const [uiScript, styleSheet] = await Promise.all([buildUiScript(), buildStyleSheet()])
  if (!uiScript.ok || !styleSheet.ok) {
    // **失敗した回は再試行しない**（`flush` は次の保存まで動かない）。直すには保存が要り、
    // その保存でまた鳴るので、同じソースを組み立て直しても同じ理由が二重に出るだけになる。
    const reasons = [uiScript, styleSheet].flatMap((result) => (result.ok ? [] : [result.reason]))
    options.onFailure({
      reason: UI_REBUILD_FAILURE_REASON.buildFailed,
      detail: reasons.join("\n"),
    })
    return
  }

  options.onRebuilt({ target, uiScript: uiScript.content, styleSheet: styleSheet.content })
}

/**
 * 変わったファイル1件から、ブラウザにさせることを決める。**CSS だけなら `style`**。
 * 名前が届かなかったとき（`fs.watch` は渡してこないことがある）は重いほうへ倒す。
 */
function targetFor(fileName: string | Buffer | null): RefreshTarget {
  return typeof fileName === "string" && extname(fileName) === ".css" ? "style" : "page"
}

/** まとめている間に届いた2つのうち、重いほう（`page`）を採る。 */
function widerTarget(left: RefreshTarget | undefined, right: RefreshTarget): RefreshTarget {
  return left === "page" || right === "page" ? "page" : "style"
}
