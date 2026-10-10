**`main-view/markdown/` の置き場を、遅延読み込みの入口（`deferred-markdown.tsx`）と置き場の表の両方が立つ形で決める（GH-562 を dropped にした理由）**

- 観点: 赤 設計の穴
- 根拠: GH-562（お伺いの札 `inquiry/` を会話の画面の部品へ上げ、部品の再エクスポートを検査で拒む）は、`inquiry/` を上げると `markdown/` の読み手が `main-view` の外にまたがり、置き場の表では `conversation/components/markdown/` の部品になる。ところが部品の外から引ける入口は `markdown.tsx` だけになり、`docs/architecture/browser.md` の「`markdown.tsx` を直接 import しない（一式が入口に戻る）」と衝突する。`report-notation.module.css`（4つの読み手が直に引く）・`split-blocks.ts`・`repository-link.tsx` も部品の入口の外から直に引かれていて、表から箱が導けない。完了条件の最後の行に従い dropped にした
- 出し先: タスクにする（difficulty は opus。設計の判断）。`markdown/` を部品にするなら入口を `deferred-markdown` 側に分けるか、表に「遅延読み込みの入口を持つ部品」の行を足すか、CSS・語彙を `domain/` へ振り分けるかを決め、`docs/architecture.md`「全体構成」の表と `browser.md` を直す。決まったあとで GH-562 と同じ中身（`inquiry/` の移動と再エクスポートを拒む検査）を後段のタスクとして登録し直す
