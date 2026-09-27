// テストの中で `*.module.css` の import を「CSS に書いた class 名をそのまま返す対応表」に
// 解決する Vite プラグイン。単体テストの設定の `plugins` に渡す。
//
// Vite / Vitest 自身の CSS Modules の処理（`vite:css`）は、ブラウザに出す実際の class 名と
// 同じハッシュ付きの名前を生成する。部品テストは CSS に書いた綴りで引くので、それより先に
// このプラグインが横取りする必要がある。`resolveId` で仮想の id（`\0` 始まり）に差し替えるのは、
// `vite:css` が id の拡張子だけを見て CSS かどうかを判断しており、`transform` の中身を
// 差し替えるだけでは `vite:css` 自身の変換を止められないため。
//
// CSS に無い名前は対応表に無いので `undefined` のままになり、綴りの間違いがテストで
// 黙って通らない。

import { readFile } from "node:fs/promises"

import type { Plugin } from "vite"

const VIRTUAL_PREFIX = "\0css-module-identity:"
const VIRTUAL_SUFFIX = ".mjs"

/** 選択子に出てくる class 名。数字で始まる長さの単位（`.5rem`）とは重ならない。 */
const CLASS_NAME_PATTERN = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g

/** ブロックコメント。中の説明文に出てくる class 名を拾わないよう先に落とす。 */
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g

export function cssModuleIdentityPlugin(): Plugin {
  return {
    name: "css-module-identity",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith(".module.css")) {
        return
      }
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (!resolved) {
        return
      }
      return `${VIRTUAL_PREFIX}${resolved.id}${VIRTUAL_SUFFIX}`
    },
    async load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX) || !id.endsWith(VIRTUAL_SUFFIX)) {
        return
      }
      const path = id.slice(VIRTUAL_PREFIX.length, -VIRTUAL_SUFFIX.length)
      const source = await readFile(path, "utf8")
      const names = [...source.replace(COMMENT_PATTERN, "").matchAll(CLASS_NAME_PATTERN)].flatMap(
        ([, name]) => name ?? [],
      )
      const classNames = Object.fromEntries(names.map((name) => [name, name]))
      return `export default ${JSON.stringify(classNames)}`
    },
  }
}
