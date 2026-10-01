# ブラウザ側

最終更新: 2026-09-28。ステータス: **正典**。

責務: ブラウザ側（`src/browser/`）の中の規則。状態の持ち方・Markdown・重いライブラリ・立ち絵の
動き・CSS・`components/ui/` の部品の作法を持つ。
読む時: `src/browser/` の部品・store・CSS を足す・直すとき。
直す時: ブラウザ側の状態の置き場・描き方・共有部品の作法を変えたとき。

## 節の索引

| 節         | 中身                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| ## browser | 状態の持ち方、Markdown、重いライブラリ、立ち絵の動き、CSS、`components/ui/` の部品（variant の作法と一覧） |

## browser

### 状態の持ち方

| 状態                                                             | 置き場所                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionState`                                                   | `browser/stores/session.ts` の zustand の store `useSession`（`applySessionEvent` で `events` を畳み、`hello` で置き換える）。部品はセレクタで**自分が読む値だけ**を購読する                                      |
| 接続中 / 切断中、プロトコルの版違い                              | 同じ store に相乗りさせる（`SessionState` には入れない）。接続は `<Root>` が `useSessionConnection()` で張る                                                                                                      |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか） | `location.hash` の `turn`（`#?turn=3`。追従中は書かない）。`browser/stores/turn-selection.ts` の `useTurnSelection()` が hash と姿から導く（自分では状態を持たない）                                              |
| 入力欄の下書き、候補の開閉と選択位置                             | `<Composer>` のローカル状態                                                                                                                                                                                       |
| 入力欄の面（素の `<textarea>` かマークダウンエディタか）         | `<Composer>` のローカル状態。`localStorage` に**モードだけ**保存（下書きは保存しない）。面を差し替えても下書きは `<Composer>` が持ったまま                                                                        |
| 質問の選択（送る前）・何問目を見ているか・入力欄に書いた答え     | `browser/stores/question-answer.ts` の zustand の store（**メインビューの札と入力欄の両方が読み書きする**ので機能のローカル状態にしない。どの答え待ちに対する下書きかも持つ）                                     |
| 経過時間の秒数                                                   | `<TurnStatus>` の1秒タイマー（`turn` の `startedAt` から計算）                                                                                                                                                    |
| 領域の比率                                                       | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                                                                                                                                                 |
| 出している画面（会話 / キャラクター / 作る）                     | `location.hash` の `?` より前（`stores/screen.tsx` の `useScreen()` が `hashchange` を読む）。保存しない（URL が持つ。`docs/architecture/screen-design.md` 13.6）。hash の書き方は `stores/location-hash.ts` だけ |

画面全体で共有する状態は **zustand の `create()`** で書き、`Context` の `Provider` で配らない
（書き方と `useShallow` の使いどころは `docs/coding-standards.md`「zustand の store」）。**姿そのものを
購読しない**（読む値が変わっていない部品まで毎フレーム描き直しになる）ので、部品はセレクタで読む値だけを取る。
**答え待ち（`pending`）が動くフレームだけ緊急**にし、レポートやツールの進行は `startTransition` に載せる。
**`location.hash` を正典にする状態は zustand に写さない**（`useHashRoute` が `useSyncExternalStore` で直接
購読する。写すと hash と store の2か所に持つことになる）。

### Markdown（`components/page/conversation/components/main-view/markdown/markdown.tsx`）

```
react-markdown
  remarkPlugins: [remark-gfm]
  rehypePlugins: [rehype-raw, [rehype-sanitize, schema], rehype-highlight]
  components: { code: フェンスの言語で MermaidBlock / ChartBlock / 通常 に振り分け, a: 許可スキームだけ }
```

- Markdown 一式は**メインビューの部品の中**に置く（読み手が `<Report>` だけなので共有の箱に上げない）
- **`schema` は許可リスト**（要素・属性と `class` の語彙 `note` / `badge` / `compare` など）。`style` 属性は
  `url(` / `@import` を含むものを落とす規則も `schema` の `attributes` の正規表現で表す。**規約
  （`report-notation.ts`）・schema・部品（`notation.tsx`）・CSS の4つは同じコミットで揃える**
- **記法の class 名は部品に解決する**（`notation.tsx`）。モデルが書くのは骨格（`note` / `badge` など）で、
  **CSS が受ける class 名（`report-` 付き）は tsukumo が付ける**ので、モデルの書いた文字列とセレクタが
  直接つながらない。**知らない class 名と `style` 属性は素通し**（変換は足し算だけ）
- 引用 `> `・ネストしたリスト・水平線・列揃え（`:---:`）・コードスパンの中の HTML は GFM の仕様どおりに
  描ける。`report-notation.ts` は「描けない記法」の迂回を持たない
- **流れる本文**: 書きかけの Markdown を空行で塊に割り、塊ごとに `memo`（鍵は塊の文字列）。
  描き直すのは末尾の塊だけ。**コードフェンスと HTML ブロックの中の空行では割らない**
  （フェンスは表や見出しに化けないため、HTML は `<details>` の中身が外へこぼれないため。
  HTML は閉じタグが必須の要素だけを深さで数え、閉じタグを省ける `p` / `li` / `td` などは数えない
  ——省略された閉じタグを待つと以降ずっと割れなくなる）。**閉じていないものは末尾の塊の中に
  閉じる**ので、書きかけの間だけその塊の `memo` が効かない

### 重いライブラリ

| もの                                                               | 読み方                                                                                                                                                                           | 置き場所            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| React・react-markdown 一式・`ws`（ブラウザ側は標準の `WebSocket`） | `vite build` が npm から束ねる                                                                                                                                                   | `node_modules`      |
| highlight.js                                                       | `rehype-highlight`（`lowlight` の common 言語）を束ねる。テーマ CSS だけ `/vendor/` で配る                                                                                       | 束ねる / `/vendor/` |
| mermaid（5.3MB）・Chart.js                                         | **束ねず `/vendor/` で配り、その記法が出たときだけ `<script>` で読む**。`MermaidBlock` / `ChartBlock` が `useEffect` で描く。mermaid は同じソースの図の SVG を覚え、描き直さない | `/vendor/`          |

`/vendor/<name>` が返すのは `node_modules` の実ファイル（`src/server/view-server/adapter/vendor-asset.ts`）で、
**CDN からは読まない**。`vite build` の出力は1本（コード分割はしない。分割するとディスクに
置かないメモリ配信と噛み合わない）。

### 立ち絵の動き

**立ち絵は「1枚の矩形」として扱う**（`docs/requirements.md` 4.3）。`<Portrait>` が動かすのは
**位置・大きさ・傾き・上下・不透明度**だけで、**素材の中身には触らない**（素材は利用者が用意するので、
作られ方を当てにできない。見返りに SVG でも PNG でも GIF でも同じだけ動く）。

- **まばたき・表情のクロスフェード・部分の動きは作らない**（素材の構造に依存するため）。
  Lottie / Live2D も同じ理由で採らない
- **動くのは利用者の注意が空いているときだけ。** `SessionState` から「いま読んでいるか、待っているか」を
  決め、**読んでいる間は呼吸だけに落とす**
- 作るのは5つ。**呼吸**（常時のごく小さい上下）/ **待っている間の移動**（ターン進行中に
  領域の中をゆっくり歩く）/ **書いている**（メインが `report` の引数を書いている間、
  筆を運ぶように小さく速く横へ揺れる）/ **完了の反応**（小さく跳ねる）/ **失敗でびくっ**（一瞬のけぞる）
- **ターンが失敗で終わったときも「失敗でびくっ」にし、「完了の反応」は出さない**（材料は `turn` の
  `finished` の `ending`）。びくっのあとに跳ねると失敗を喜んで見える。**表情は変えない**（表情の源は
  `speak` だけ。`docs/requirements.md` 4.3）——動きは矩形の位置だけなのでこの原則に触れない
- **`<Portrait>` の動きは領域の外へ出さない。** **レポートの上に出てよいのはミニ立ち絵だけ**
  （`docs/requirements.md` 4.3）で、メインビュー側の別の部品が矩形を描く `components/domain/portrait.tsx` を
  共有する（「1枚の矩形しか動かさない」原則は崩れない）
- `prefers-reduced-motion: reduce` を尊重する（`src/browser/styles/theme.css`）
- 動きは CSS の `@keyframes` と `transform` で足りる。**`<canvas>` もアニメーションの
  ライブラリも要らない**（矩形しか動かさないため）

### CSS

**CSS Modules（`*.module.css`）を部品と同居させる。** 置き場は **class ごとに、読み手すべてを含む
いちばん近い箱**（`docs/architecture.md`「ページの形」の表と同じ決め方）。**1つの部品（と中の子部品）だけが
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

class 名は用語集の語（`balloon` / `portrait` / `turn-header` など）を**そのまま**保ち、部品からは
`styles["balloon-track"]` と引く（キャメルケースへ変換しない）。実際に DOM へ付く名前は
**組み立てのたびにハッシュ化される**ので、外から要素を指す口が要るところは `data-*` を持つ
（4領域の `data-region`。`scripts/capture-view.ts` が使う）。

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

### `components/ui/` の部品（variant の作法と一覧）

**語彙を持たない部品は、見た目の違いを variant（props の文字列リテラルの合併型）で表し**、呼び出しを
読めば見た目が分かる形にする。**部品が持つ見た目は `theme.css` のトークンと、ここで決めた段だけ。**
置くかどうかは**tsukumo の語彙を持たないか**だけで決め、読み手の数は問わない（「引き金は逆にも引く」の
検査は掛けない）。**`components/ui/` はストアを読めない**。

- **variant 部品**（`Text` / `Heading` / `Stack`（と `VStack` / `HStack`）/ `Button` / `Dialog`）は見た目を
  部品が持つ。**形だけの部品**（`Select`）は寸法・枠・地・字の段を呼び出し側が `className` で渡し、
  **variant を持たない**（プルダウンは置き場所ごとに寸法がまるで違う）
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
  `styles["…"]`（2枚読むときは `<箱の名前>Styles["…"]`）の字面だけ**で、重なりは `test/architecture.test.ts`「components/ui/ の部品の className」が見る
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
