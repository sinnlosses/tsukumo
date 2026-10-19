# コーディング規約: 層と依存の向き

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: 層と依存の向きのうち、`docs/architecture.md` の表だけでは読み取れない決まり（配線・`core` と `browser`・`import type`・`browser` の箱）と、ファイル名・ディレクトリ名・barrel file の規約を持つ。
読む時: 新しいファイルの層と置き場所を決めるとき、import の向きやファイル名・ディレクトリ名を確かめるとき。
直す時: 層の辺・命名の規約を変えたとき、`test/architecture/layer.test.ts` などの検査を変えたとき。

## 節の索引

| 節                | 中身                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| ## 層と依存の向き | 4つの単位と、許した import の辺。命名（ファイルは単数形・置き場所のディレクトリ名） |

## 層と依存の向き

**2026-09-13 の移行後、`src/` は層をディレクトリで表す**（設計は `docs/architecture.md`「全体構成」）。
**2026-09-16 にサーバ側を `core`（判断）と `adapter`（境界）に割り、2026-09-20 に層の名前を
実行環境に合わせて `shared`（サーバとブラウザ）/ `browser`（ブラウザ）へ改名し、サーバ側の
2つを `src/server/` の下へ入れ子にした。** **2026-09-25 に、サーバ側の `core` と `adapter` を
機能の中へ入れると決めた**（`src/server/<機能>/{core,adapter}/`。機能の一覧・機能どうしの辺・
共有の箱は `docs/architecture.md`「サーバの機能と、機能どうしの辺」が正典）。
**新しいファイルは、まずどの層かを決めてから置く**（サーバ側は、どの機能かも決める）。

**4つの層（`shared` / `server/core` / `server/adapter` / `browser`）が何を置き、どこへ import して
よいかの表は
二重に書かず `docs/architecture.md`「層と依存の向き」を正典とする**（`src/browser/` の箱の表と
同じ扱い）。ここには、その表だけでは読み取れない決まりを書く。

`src/` 直下（`cli.ts` / `main.ts` と起動の段取り）と `src/wiring/` は配線なので全部を import してよい。**`core` と `browser` は互いを import しない。**
**`core → adapter` も禁止**で、`core` は `node:` / `@anthropic-ai/*` / `ws` を import しない
（外の世界へ出る道が無い）。両者を結ぶのは `src/` 直下と `src/wiring/` だけ。`adapter` は**1ファイル = 1つの境界**で、
インターフェースは切らない（実装が2つあるもの — 駆動とホスト — だけ契約の型を `core` に置く）。
`shared` は `node:` にも `document` にも触らない（両方の実行場所で動くため）。**許した辺以外は
`test/architecture/layer.test.ts` が落とす**ので、向きを変えたくなったら先にこのテストと `docs/architecture.md`
「全体構成」を直す。

**型だけの import は文全体の `import type` で書く**（`import { type X }` ではなく）。Node の
型消去は `import { type X }` を `import {} from` として残し、読み込み先を値として評価するので、
import の輪ができると初期化前参照で落ちる。`typescript/no-import-type-side-effects` が落とす。

**`browser` 層の中も、箱（`main.tsx` / `app.tsx` / `features/` / `components/` / `lib/` / `stores/`）ごとに
import してよい先が決まっている**（表は二重に書かず `docs/architecture/browser-box.md`「`src/browser/` の箱と、
置く基準」を正典とする）。この縦の辺も `test/architecture/browser-box.test.ts` が落とす。

**ファイルは単数形にする。** 複数は「複数返す」関数名の側で表す（`beads-task.ts` の
`taskSummaryItemsOfBeadsIssues`）。理由は、ファイル名が**概念**を指すため（原則5）。概念は1つで、いくつ返すかは
関数の都合。

**ディレクトリ名には単数形の縛りを掛けない**（2026-09-26 に外した）。置き場所のディレクトリは
bullet-proof-react の名前（`features/` `components/` `lib/` `stores/` `styles/` `types/`）をそのまま使い、
機能・領域のディレクトリは `components/page/conversation/components/markdown/renderer/` のように
**概念の名前**を付ける。**置き場所を名前にしたディレクトリのうち、`lib/` と `utils/` はどの層の中にも作ってよく、
`helpers/` と `common/` は作らない**（2026-09-21 決定。どちらの箱に置くかの判定手順・`utils/` を
受け皿にしないための歯止め・層ごとの読み方は二重に書かず `docs/architecture.md`「全体構成」
「`lib/` と `utils/` に置く基準」を正典とする）。**ファイル名としての `utils.ts` / `helpers.ts` /
`common.ts` は引き続き作らない**（許したのはディレクトリの名前だけで、ファイル名は概念のまま）。

**barrel file を作らない。** ディレクトリに `index.ts` を置いて中身をまとめて re-export しない
（import は実ファイルを直接指す）。理由は2つ: (1) 束ねるときの tree-shaking が効かなくなる
（`browser` は `vite build` で1本に束ねる。`docs/architecture/build.md`）。(2) `index.ts` という名前自体が
「置き場所を名前にしたファイル」になり、原則5に反する（ディレクトリ名がすでに概念や置き場所を
表すのに、その中の `index.ts` は何も指さない。**ディレクトリ名の例外を足した後も、ファイル名は
概念のまま**）。2026-09-13、`src/browser/` を切った段（`docs/history/decision.md`
「design.md 12. 移行の段階」の段3）で bulletproof-react の実例と突き合わせて決めた。

**`components/ui/` の部品は `ui/<部品>/<部品>.tsx` に置き、`index.tsx` は作らない。検査が
落とす。** 部品ごとのディレクトリに分けるのは `docs/architecture/directory.md`「1部品1フォルダは
真似しない」の例外で、barrel file を作らない理由はここと二重に書かない。
