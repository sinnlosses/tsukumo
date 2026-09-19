// テストの中で `*.module.css` の import を「CSS に書いた class 名をそのまま返す対応表」に
// 解決する（`bunfig.toml` の `preload`）。
//
// **bun のテストランナーは CSS を組み立てない**ので、何もしないと対応表が空で届き、部品が付ける
// class 名がすべて `undefined` になる（class 名で引く部品テストが当たらなくなる）。ここで返すのは
// **CSS に書いた綴りそのもの**で、ブラウザに出る実際の名前（ハッシュ付き）とは違う。
// CSS に無い名前は `undefined` のままにして、綴りの間違いがテストで黙って通らないようにする。
//
// `Bun.plugin` を使うのは、差し替える先がテストランナーの読み込みそのものだから
// （`docs/coding-standards.md`「Bun固有APIに寄せない」の `bun:test` と同じ側）。

import { readFile } from "node:fs/promises"

import { plugin } from "bun"

/** 選択子に出てくる class 名。数字で始まる長さの単位（`.5rem`）とは重ならない。 */
const CLASS_NAME_PATTERN = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g

/** ブロックコメント。中の説明文に出てくる class 名を拾わないよう先に落とす。 */
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g

plugin({
  name: "css-module-identity",
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      const source = await readFile(args.path, "utf8")
      const names = [...source.replace(COMMENT_PATTERN, "").matchAll(CLASS_NAME_PATTERN)].flatMap(
        ([, name]) => name ?? [],
      )
      const classNames = Object.fromEntries(names.map((name) => [name, name]))
      return { contents: `export default ${JSON.stringify(classNames)}`, loader: "js" }
    })
  },
})
