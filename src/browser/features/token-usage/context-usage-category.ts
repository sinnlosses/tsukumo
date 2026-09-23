// コンテキストの内訳の分類（`docs/glossary.md`「コンテキストの内訳」）を画面に出すときの
// 名前と色。**SDK が返すのは英語の表示名**なので、知っているものだけ日本語に置き換え、
// **知らない名前は英語のまま出す**（訳せないものを隠さない）。
//
// **分類の判定には使わない。** 何が中身で何が空きかは `kind` が持っていて（`src/shared/
// context-usage.ts`）、ここが持つのは見せ方だけ。
//
// 色は `token-usage.module.css` の `.context-tone-<tone>` に対応する（13.1 原則5。**凡例に
// 分類名が必ず並ぶ**ので、色は読みやすさの重ねがけになる）。

/** 分類1つの見せ方。 */
export type CategoryLook = {
  /** 画面に出す名前。 */
  readonly label: string
  /** 色の綴り（`token-usage.module.css` の `.context-tone-<tone>`）。 */
  readonly tone: string
}

/**
 * 知っている分類の見せ方。**鍵は SDK が返す表示名そのもの**（`/context` の行の名前）。
 * `Map` にしてあるのは、知らない名前を引いたときに「無い」が返る形で受けるため。
 */
const CATEGORY_LOOKS = new Map<string, CategoryLook>([
  ["System prompt", { label: "システムプロンプト", tone: "system-prompt" }],
  ["System tools", { label: "システムツール", tone: "system-tools" }],
  ["MCP tools", { label: "MCP ツール", tone: "mcp-tools" }],
  ["Memory files", { label: "メモリファイル", tone: "memory-files" }],
  ["Skills", { label: "スキル", tone: "skills" }],
  ["Messages", { label: "メッセージ", tone: "messages" }],
  ["Free space", { label: "空き", tone: "free" }],
  ["Autocompact buffer", { label: "自動圧縮バッファ", tone: "buffer" }],
  ["MCP tools (deferred)", { label: "MCP ツール（窓の外）", tone: "other" }],
  ["System tools (deferred)", { label: "システムツール（窓の外）", tone: "other" }],
])

/** 知らない分類の見せ方（名前は英語のまま、色は1つの「その他」に寄せる）。 */
export function categoryLook(name: string): CategoryLook {
  return CATEGORY_LOOKS.get(name) ?? { label: name, tone: "other" }
}
