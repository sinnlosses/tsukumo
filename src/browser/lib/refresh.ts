// 「配っているものが替わった」という合図（`refresh` フレーム）を受けて、ブラウザ側で
// 実際に取り直す。開発サーバを差し込んだ起動（`--dev`）でだけ届く（docs/design.md 11章）。
//
// `style` はページを読み込み直さない。`<link>` の `href` に版のクエリを付けて
// 差し替えれば新しい CSS が当たり、開いているターンの選択も入力欄の書きかけも残る。
// `page` はページごと読み込み直す（状態はサーバ側の畳み込みが
// 持っていて、繋ぎ直すと `hello` で戻ってくる）。

import { type RefreshTarget } from "../../shared/frame.ts"
import { nowEpochMilliseconds } from "../utils/clock.ts"

/** `<link>` の href に足して取り直させるクエリ。値は時刻で、サーバ側では読まない。 */
const STYLE_REVISION_QUERY_NAME = "r"

/** 合図1つを実行する。 */
export function applyRefresh(target: RefreshTarget): void {
  if (target === "page") {
    window.location.reload()
    return
  }

  // 外部ライブラリのテーマ CSS もまとめて取り直すことになるが、`max-age` が効いていて実害が無い
  // （経路名で選り分けると、その名前を browser 側に書くことになる）。
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const url = new URL(link.href)
    url.searchParams.set(STYLE_REVISION_QUERY_NAME, String(nowEpochMilliseconds()))
    link.href = url.href
  }
}
