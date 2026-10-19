# ブラウザ側: 組み立てと見た目

ステータス: **正典**。入口は `docs/architecture/browser.md`（ブラウザ側の全体）。

責務: ブラウザ側（`src/browser/`）の重いライブラリの読み方・CSS・`components/ui/` の部品の作法。
読む時: ライブラリの読み込み・CSS・共有部品を足す・直すとき。
直す時: ブラウザ側の組み立て・CSS の置き場・共有部品の作法を変えたとき。

## 節の索引

| 節         | 中身                                                                 |
| ---------- | -------------------------------------------------------------------- |
| ## browser | 重いライブラリ、CSS、`components/ui/` の部品（variant の作法と一覧） |

## browser

### 重いライブラリ

| もの                                                               | 読み方                                                                                                                                                                           | 置き場所            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| React・react-markdown 一式・`ws`（ブラウザ側は標準の `WebSocket`） | `vite build` が npm から束ねる                                                                                                                                                   | `node_modules`      |
| highlight.js                                                       | `rehype-highlight`（`lowlight` の common 言語）を束ねる。テーマ CSS だけ `/vendor/` で配る                                                                                       | 束ねる / `/vendor/` |
| mermaid（5.3MB）・Chart.js                                         | **束ねず `/vendor/` で配り、その記法が出たときだけ `<script>` で読む**。`MermaidBlock` / `ChartBlock` が `useEffect` で描く。mermaid は同じソースの図の SVG を覚え、描き直さない | `/vendor/`          |

`/vendor/<name>` が返すのは `node_modules` の実ファイル（`src/server/view-server/adapter/vendor-asset.ts`）で、
**CDN からは読まない**。

`vite build` の出力は入口の `ui.js` と、**Markdown の描画一式だけを `import()` で分けたチャンク**。
Markdown を描く口は2つあり、どちらも `import()` で読む。

| チャンク               | 中身                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `markdown-renderer.js` | レポートの描画（`renderer/markdown-renderer.tsx` から先の rehype 一式・highlight.js・図とグラフの部品）  |
| `task-body.js`         | タスクの本文の描画（`task-body.tsx` と ID の自動リンク）                                                 |
| `lib.js`               | 2つが共に読む react-markdown・remark・micromark 一式（組み立てが自動で括り出す。名前も組み立てが付ける） |

CSS は分けず1本。サーバは起動時にすべてメモリに読み、`/assets/` で**組み立てた名前の一覧にある名前だけ**を
配る（要求のパスからファイルを組み立てない）。入口の名前は配る URL と同じにする（チャンクは入口を `./ui.js` で
import するので、食い違うと入口を別のモジュールとして読み React が2つ動く）。

- 使い手は Markdown の部品の口 `markdown.tsx`（`<Report>`・お伺いと質問の記録の preview）と `deferred-task-body.tsx`
  （タスクのモーダルの詳細・サイドバーののぞき窓）を使い、描画一式の `renderer/markdown-renderer.tsx`・`task-body.tsx` を直接
  import しない（すると一式が入口に戻る）。読み込みの状態の持ち方は2つとも `hooks/deferred-module.ts` の `deferredModule`。
  外から引く口の `markdown.tsx` が遅延読み込みの側で、描画一式は中の `renderer/` に入るので、描画一式を外から直に
  import すると部品の境界の検査（`test/architecture/browser-box.test.ts` の `componentBoundaryViolations`）が落とし、口から
  `renderer/` を再エクスポートすると再エクスポートの検査が落とす
- 読み込みは `main.tsx` が最初の描画の前に `loadMarkdown()`・`loadTaskBody()` で1回ずつ起こし、済んだことを zustand の
  store に持つ。読み終わっていれば同じ描画で本体を出し、まだなら高さを持たない空の器に `aria-busy="true"` を出す。
  ブラウザは同じ URL の `import()` の失敗を覚えていて取り直さないので、読めなかったら本文を字のまま出して
  `aria-busy` を出さず、回復はページの読み直しに任せる
- **`React.lazy` と `Suspense` は使わない。** `lazy` は読み終わっていても最初の1回は必ず suspend し、
  store の更新（同期の lane）では fallback をその場でコミットする。React 19 は fallback から本体への
  差し替えを `setTimeout` で 300ms 間引くので、最初のレポートが 300ms 遅れ、時計を止めた E2E では眠ったままになる

### CSS

**CSS Modules（`*.module.css`）を部品と同居させる。** 置き場は **class ごとに、読み手すべてを含む
いちばん近い箱**（`docs/architecture/directory.md`「ページの形」の表と同じ決め方）。**1つの部品（と中の子部品）だけが
読む class は部品の隣の `<部品>.module.css`** に置き、**container / presenter か2つ以上の部品が読む class
だけ**を領域・機能・ページの1枚（`<領域>/<領域>.module.css`・`features/<機能>/<機能>.module.css`・
`<ページ>.module.css`）に置く。部品が平たく並ぶ `components/`（`features/<機能>/components/` など）でも、
部品の `.tsx` の隣に同じ名前で置く（container / presenter の対は対の名前）。自分の見た目を持つ共有部品も
隣に置く（`components/domain/portrait.module.css`）。**グローバルなのは `styles/theme.css` だけ**で、
トークン（`:root`）・`body`・フォーカスの輪・`prefers-reduced-motion`・リンクを持つ。
**16進の色を書いてよいのもそこだけ**（`docs/architecture/screen-design.md` 13.2）。同居に移した理由は `docs/history/decision.md`
「design.md 6.6 CSS（機能と同居させる形に移した理由）」。

**選択子で結ばれた class（`.a .b`・`.a > .b`・`.a.b`・`.a:has(.b)`）は1つのファイルに置き、結ばれた class の
読み手を合わせて置き場を決める**（CSS Modules はファイルごとに名前を変えるので、別のファイルの class を
選択子で指せない）。1つの要素に付く別のファイルの class どうしが同じ property を書くときも、勝ち負けが
読み込み順で決まらないよう、親の class から書いて詳細度で勝たせるか、同じファイルに置く。部品が自分の1枚と
共有の1枚を両方読むときは、自分のものを `styles`、共有の1枚を `<箱の名前>Styles`（`taskBoardStyles` など）で
import する。

class 名は用語集の語（`balloon` / `portrait` / `work-strip` など）を**そのまま**保ち、部品からは
`styles["balloon-track"]` と引く（キャメルケースへ変換しない）。実際に DOM へ付く名前は
**組み立てのたびにハッシュ化される**ので、外から要素を指す口が要るところは `data-*` を持つ
（4領域の `data-region`。`scripts/capture/capture-view.ts` が使う）。

**`styles["..."]` の型は、CSS に書いた class 名ごとに生成した型宣言から来る**（`happy-css-modules` が
`dist/css-module-type/` に書き、`tsconfig.json` の `rootDirs` で隣にあるものとして解決させる。部品の隣に
置かないのは、ページと部品の直下に置けるファイルが決まっているため）。CSS に無い名前は型エラーになり、
ある名前は `string` で届くので `?? ""` で受けない。

**Tailwind には移らない**（`theme.css` のトークンと `docs/architecture/screen-design.md` のトークンの節を作り直す
ことに見合う困りごとが無い）。

**機能をまたいで見た目が要るときは className を渡す**（CSS の選択子で他の機能の class を
指さない）。`<Portrait>` が例で、立ち絵そのものの中身と動きは `components/domain/portrait.module.css`、
**どこにどれだけの大きさで置くか**は呼び出し側が `className` で足す。打ち消しは**親の class から**書いて
（`.character-layout .portrait`）、読み込み順ではなく詳細度で勝たせる。

**テストの中では class 名が CSS に書いた綴りのまま届く**（`test/css-module-loader.ts` が
単体テストの設定に渡す Vite プラグイン）。Vite の既定の CSS Modules の変換はブラウザに出す
実際の名前と同じハッシュ付きの名前を生成するので、これが無いと部品テストが綴りで引けない。
CSS に無い名前は `undefined` のままなので、**綴りを間違えるとテストで落ちる**。

**customizable select（`appearance: base-select`）の落とし穴**（先例は `features/run-setting/components/run-setting-select.module.css`）：

- `::picker(select)` に `display` を無条件に書くと、閉じたときのブラウザ既定の `display: none` が
  上書きされ、閉じた口の上に一覧が残って隣の口のクリックを塞ぐ。**`display` は `:popover-open` の中だけに書く**
- `<option>` に手で `aria-selected` を付けると、↑↓ で動いても Enter で値が確定しない。
  **選ばれた行の見た目は `:checked` で当てる**
- `position-area` を指定しないと、窓の右端に近い口の一覧が窓の外へはみ出る。
  **`position-area: bottom span-left` で左へ吊り、`margin` で窓の縁から離す**。柱の中など吊る向きが
  違う口は、修飾子の class で上書きする

**押せる要素（`button`・`a`・`summary` など）を足す・直すときは、高さも幅も 24px 以上にする**（約束は `docs/architecture/screen-design/layout.md` 13.4 の「押せるものは 24x24 以上」。実ブラウザで測らないと分からず単体では拾えないので、守っているのは E2E の `test/e2e/target-size.test.ts`）。足したら `pnpm run test:e2e test/e2e/target-size.test.ts` を単独で流してから全件へ進む。

### `components/ui/` の部品（variant の作法と一覧）

**語彙を持たない部品は、見た目の違いを variant（props の文字列リテラルの合併型）で表し**、呼び出しを
読めば見た目が分かる形にする。**部品が持つ見た目は `theme.css` のトークンと、ここで決めた段だけ。**
置くかどうかは**tsukumo の語彙を持たないか**だけで決め、読み手の数は問わない（「引き金は逆にも引く」の
検査は掛けない）。**`components/ui/` はストアを読めない**。

- **variant 部品**（`Text` / `Heading` / `Stack`（と `VStack` / `HStack`）/ `Button` / `Dialog`）は見た目を
  部品が持つ。**形だけの部品**（`Select`）は寸法・枠・地・字の段を呼び出し側が `className` で渡し、
  **variant を持たない**（プルダウンは置き場所ごとに寸法がまるで違う）。`TextField`（1行の `input` と
  複数行の `textarea`）は variant を持たない部品で、地・色・枠の線・角丸・字の段を部品が持ち、寸法・余白・
  枠の色は呼び出し側が `className` で渡す。`Field`（名札・入力欄・ヒントを縦に積む欄）は `variant`
  （`form`＝入力の名札、`confirm`＝確かめの問いかけ。名札の字の組が違う）で名札の字を決め、`id` を名札の
  `htmlFor` に渡して入力欄（`TextField` を `children` で受ける）と結ぶ。ヒントの無い欄は `hint` に
  `undefined` を渡す。**差し込み口の部品**
  （`BottomSheet`。狭い画面の板）は面の形と閉じ方を部品が持ち、頭・中・下端は props の `ReactNode` で受ける。
  `Menu`（「…」の口から開く操作の一覧）は開閉・キーボード・位置・顔を部品が持ち、行（名前・`danger` の顔・
  押せない・前の区切り・選んだときの処理）は props で受ける
- **1つの prop が1つの軸**。1つの property に写る軸は**値の名前をトークン名そのままにする**
  （`size: "secondary"` → `--font-secondary`）。**複数の property の束（ボタンの顔）は、使っている
  組み合わせごとに1つの値にする**（軸を掛け合わせると CSS の無い組み合わせが型の上で選べてしまう）
- 合併型 → class の対応表は **`satisfies Record<合併型, string | undefined>` で全域を検査する**。
  値 `"inherit"` は class を付けない。**props はすべて必須**（既定値を持たず、呼び出しを読めば見た目が
  全部分かる）。**値を足すのは使う箇所が出たときだけ**で、トークンに無い値が要るなら先に
  `docs/architecture/screen-design.md` の段を直す
- **上書きは `className` の1つ**。**部品の CSS で `:where()` の外に書いた property は部品のもの**で、
  呼び出し側は同じ property を書かない。呼び出し側に譲る既定（`margin: 0` など）は `:where()` の中に書く
  （詳細度0なので読み込み順に関係なく呼び出し側が勝つ。`theme.css` が要素の選択子で書く property は
  入れない）。呼び出し側が渡すのは**置き方**と**語彙に無い見た目**だけ。**`className` に渡すのは
  `styles["…"]`（2枚読むときは `<箱の名前>Styles["…"]`）の字面だけ**で、重なりは `test/architecture/style.test.ts`「components/ui/ の部品の className」が見る
- **画面固有の値を持つもの（`--usage-*`・`--diary-gold-*`）は部品を使わず、機能の CSS のまま残す**
  （部品の語彙と画面の語彙が1つの要素の上で競る）。**段に乗らない値も丸めない**——部品に置き換えても
  画面の見た目は変えないのが既定で、丸めると決めたら変わる画面を目視で確かめる
- **汎用の `as` は持たない**（`href` のような要素固有の属性が型から外れる）。要素を選ぶのは閉じた合併型の
  prop（`Heading` の `level`・`Stack` の `element`）だけ。`Stack` は `data-*` とイベントの口を持たない
- **Text と Heading の境目**: 見出しの意味（`level`）と見た目（`size`）を別の props にする。対応表は
  `ui/text/` の1つを読む（二重に持たない）。`<h*>` でない「見出しに見える字」は `Heading` にしない
- **`VStack` / `HStack`** は向きの決まった並べで、向きを値で切り替える箇所だけ `Stack` を直接使う
- **`Button`**: 押せないは **`aria-disabled` の1通り**。押せないときの見た目は既定で透かし、字や地を
  沈める顔が要るときは**押せないときの顔ごと variant の1つの値にする**（押せないを別の prop の軸にしない）。**押せる行・押せる文字**（タスクの ID・件数の
  チップ・暦の日・吹き出しのように、中身そのものを押すもの）は `Button` にしない
- **札（Badge / Chip）・`<details>`・地の段を持つ箱（Card / Surface）は部品にしない**（箱の値が置き場所
  ごとに違い、値を全部 `className` で渡すことになる。1つずつの理由は `docs/history/decision.md`
  「design.md 2. 全体構成 / `components/ui/` の部品（採らなかった部品）」）
- テストは `test/browser/components/ui/<部品>/<部品>.test.tsx` で、variant の値 → 付く class・描く要素・
  振る舞いまで。**対応表は全行を写さず、軸ごとに1つの値で配線だけを見る**（表の全域は `satisfies`、
  class の綴りは CSS の型宣言が守る）。**E2E の期待値に出る属性（`aria-*`・`type`）の受け渡しは単体で
  重ねない**。**色や寸法が効いているか（絵）は守らない**（置き換えのたびに目視で確かめる）
- **部品の振る舞いは呼び手の単体で再演しない**。`Button` の押せないときに `onClick` を呼ばない・
  ネイティブの `disabled` を持たずフォーカスが残る、`Dialog` の `open`・Esc・backdrop・中のクリックは
  部品のテストが持つ。呼び手の単体が見るのは、押せない条件（`aria-disabled`）と `onClose` の配線を
  1つずつだけ
