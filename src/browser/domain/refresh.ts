// 「配っているものが替わった」という合図（`refresh` フレーム）を受けて、ブラウザ側で実際に取り直す。
// 開発サーバを差し込んだ起動（`--dev`）でだけ届く。
//
// `style` はページを読み込み直さない。
// `<link>` の `href` に版のクエリを付けて差し替えれば新しい CSS が当たり、開いているターンの選択も入力欄の書きかけも残る。
// `page` はページごと読み込み直す（状態はサーバ側の畳み込みが持っていて、繋ぎ直すと `hello` で戻ってくる）。

import type { RefreshTarget } from "../../shared/frame.ts"

/** `<link>` の href に足して取り直させるクエリ。値は時刻で、サーバ側では読まない。 */
const STYLE_REVISION_QUERY_NAME = "r"

/** 取り直しが触る外の世界。`stylesheetLinks` は stylesheet の `<link>`（`href` は絶対 URL で読める）。 */
export type RefreshEnvironment = {
  readonly reloadPage: () => void
  readonly stylesheetLinks: readonly { href: string }[]
  readonly now: () => number
}

export function applyRefresh(target: RefreshTarget, environment: RefreshEnvironment): void {
  if (target === "page") {
    environment.reloadPage()
    return
  }

  // 外部ライブラリのテーマ CSS もまとめて取り直すことになるが、`max-age` が効いていて実害が無い。
  // 経路名で選り分けると、その名前を browser 側に書くことになる。
  for (const link of environment.stylesheetLinks) {
    const url = new URL(link.href)
    url.searchParams.set(STYLE_REVISION_QUERY_NAME, String(environment.now()))
    link.href = url.href
  }
}
