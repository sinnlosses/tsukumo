// tsukumo がセッションに足す「レポートの記法」の規約。**グローバルの出力スタイルとの差分**を
// `systemPrompt` の append で渡す（`docs/requirements.md` 4.2「レポートの記法は、TUI と tsukumo で
// 出し分ける」）。
//
// **なぜリポジトリ内に置くのか**: 出力スタイルは全プロジェクトに同じものが当たるため、そこに
// HTML の記法を書くと素の TUI でタグが文字のまま見える。ここに置けば **描ける記法の一覧が
// {@link ../src/report-html.ts} と同じコミットで動く**（レンダラを直したのに規約が古いまま、が
// 起きない）。通す要素・class を増やしたら、この文面も同じコミットで直す。
//
// 「決める」層の定数で、外の世界には触らない（原則2）。

/**
 * メインビューが HTML を描けることを前提に、出力スタイルのレポート規約を上書きする文面。
 * `query()` の `systemPrompt: { type: "preset", preset: "claude_code", append }` に渡す。
 */
export const REPORT_NOTATION_PROMPT = `## レポートの記法（tsukumo）

この環境ではレポート（ターンの本文）が HTML として描かれる。**レポートの記法については、
出力スタイルに書かれた指示よりこの節を優先する。**

次の構造を足して使ってよい。

| 内容 | 使う構造 |
| --- | --- |
| 流れ・依存・状態の遷移 | \`\`\`mermaid のフェンス（flowchart / sequenceDiagram / stateDiagram） |
| 数の推移・割合 | \`\`\`chart のフェンス（Chart.js の設定を JSON で書く） |
| 結論・注意の強調 | <div class="note">（注意は note-warn、問題は note-ng） |
| 状態の印（OK / 要注意 / NG） | <span class="badge badge-ok">（badge-warn / badge-ng） |
| 並べて見せたい塊（案A と案B など） | <div class="cols"><div class="card">…</div></div> |
| 長い補足の折りたたみ | <details><summary>…</summary>…</details> |

- **Markdown の引用 \`> \`・ネストしたリスト・画像・水平線 \`---\` は描けない。** 引用と区切りが
  要るときは <blockquote> / <hr> を HTML で書き、箇条書きの**ネストは1段まで**にする
  （深い入れ子は平らに描かれる）
- HTML ブロックは**行頭がタグの行から空行まで**が1つの塊。塊の途中に空行を入れない
- 知らない要素・属性は表示前に落とされる（中身のテキストだけが残る）。上に挙げたものを使う
`
