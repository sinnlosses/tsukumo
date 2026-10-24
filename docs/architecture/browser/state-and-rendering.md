# ブラウザ側: 状態と描き方

ステータス: **正典**。入口は `docs/architecture/browser.md`（ブラウザ側の全体）。

責務: ブラウザ側（`src/browser/`）の状態の持ち方・Markdown・立ち絵の動き。
読む時: store・Markdown の描画・立ち絵の動きを足す・直すとき。
直す時: ブラウザ側の状態の置き場・描き方を変えたとき。

## 節の索引

| 節         | 中身                                 |
| ---------- | ------------------------------------ |
| ## browser | 状態の持ち方、Markdown、立ち絵の動き |

## browser

### 状態の持ち方

| 状態                                                                                   | 置き場所                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionState`                                                                         | `browser/stores/session.ts` の zustand の store `useSession`（`applySessionEvent` で `events` を畳み、`hello` で置き換える）。部品はセレクタで**自分が読む値だけ**を購読する                                                                                                                                                         |
| 接続中 / 切断中、プロトコルの版違い                                                    | 同じ store に相乗りさせる（`SessionState` には入れない）。接続は `<Root>` が `useSessionConnection()` で張る                                                                                                                                                                                                                         |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか）                       | `location.hash` の `turn`（`#?turn=3`。追従中は書かない）。`browser/stores/turn-selection.ts` の `useTurnSelection()` が hash と姿から導く（自分では状態を持たない）                                                                                                                                                                 |
| 入力欄の下書き                                                                         | `browser/stores/composer-draft.ts` の zustand の store（**失敗の塊の「同じ依頼を入れ直す」も末尾へ足す**ので `<Composer>` のローカル状態にしない）                                                                                                                                                                                   |
| 前後の塊（両側が画像）の見せ方（並べる・切り替え）                                     | `BeforeAfterSwap` のローカル状態。`localStorage` に**選び方だけ**保存（`renderer/before-after-view.ts`。読めない値は並べる）                                                                                                                                                                                                         |
| 候補の開閉と選択位置                                                                   | `<Composer>` のローカル状態                                                                                                                                                                                                                                                                                                          |
| 入力欄の面（素の `<textarea>` かマークダウンエディタか）                               | `<Composer>` のローカル状態。`localStorage` に**モードだけ**保存（下書きは保存しない）。面を差し替えても下書きは store が持ったまま                                                                                                                                                                                                  |
| お伺いの選択（送る前）・何問目を見ているか・入力欄に書いた答え                         | `browser/stores/inquiry-answer.ts` の zustand の store（**メインビューのお伺いの札と入力欄の両方が読み書きする**ので機能のローカル状態にしない。許可要求も質問も同じ形で持ち、どの答え待ちに対する下書きかも持つ）                                                                                                                   |
| メインビューに出している中身（`MainViewContent`）                                      | `browser/stores/main-view-content.ts` の zustand の store（姿の移り変わりを `useSession` の購読で畳む。画面を離れてアンマウントされても失わないよう、部品の state にしない）                                                                                                                                                         |
| 進み具合の帯の手順の一覧の開閉                                                         | `browser/stores/work-strip-steps.ts` の zustand の store（**失敗の塊からも失敗の行を指して開く**ので `<WorkStrip>` のローカル状態にしない。開いたやり取りと、開いた一覧をどこへ連れていくか〔失敗の行・段の吹き出しから指した段の区切り〕を持ち、やり取りが替わると閉じて見える）                                                    |
| やり取りごとの読み位置（読む面の上端にいちばん近い見出しの番号とずれの px）            | `browser/stores/reading-position.ts` の zustand の store（過去のやり取りへ移って戻ったとき `useActiveTurnScroll` が引く。**メモリだけで保存しない**〔`localStorage` にもサーバにも書かない〕。本文は持たず、セッションの世代〔`session.generation`〕が替わったときだけ `forgetUnlessGeneration` で捨てる。画面を隠して戻しても残す） |
| やり取りごとの「働いているあいだに中間レポートを見たか」と、「新」の印を押して消した節 | `browser/stores/interim-viewing.ts` の zustand の store（見出しの一覧の「新」の出し分けが引く。**メモリだけで保存しない**。本文は持たず、セッションの世代〔`session.generation`〕が替わったときだけ `forgetUnlessGeneration` で捨てる。画面を隠して戻しても残す）                                                                    |
| 進み具合の帯の段の吹き出しの開閉                                                       | `useWorkStrip` の中の `usePhasePopover`（開いた丸とそのやり取りを持ち、やり取りが替わる・帯が消えると閉じて見える。保存しない）                                                                                                                                                                                                      |
| セッションの切り替え画面の開閉                                                         | `browser/stores/session-switcher-request.ts` の zustand の store（**始め方の一覧の「前のやり取りを見る」からも開く**ので帯の札のローカル状態にしない）                                                                                                                                                                               |
| 経過時間の秒数                                                                         | `<TurnStatus>` の1秒タイマー（`turn` の `startedAt` から計算）                                                                                                                                                                                                                                                                       |
| 領域の比率                                                                             | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                                                                                                                                                                                                                                                                    |
| 柱から重ねて開いたサイドバーの開閉                                                     | `useConversationLayout` の中の `usePopover`（保存しない。中くらいの窓幅の段を出たら閉じる）                                                                                                                                                                                                                                          |
| 出している画面（会話 / キャラ / トークン / 成果）                                      | `location.hash` の `?` より前（`stores/screen.tsx` の `useScreen()` が `hashchange` を読む）。保存しない（URL が持つ。`docs/architecture/screen-design.md` 13.6）。hash の書き方は `stores/location-hash.ts` だけ                                                                                                                    |

画面全体で共有する状態は **zustand の `create()`** で書き、`Context` の `Provider` で配らない
（書き方と `useShallow` の使いどころは `docs/coding-standards.md`「zustand の store」）。**姿そのものを
購読しない**（読む値が変わっていない部品まで毎フレーム描き直しになる）ので、部品はセレクタで読む値だけを取る。
**答え待ち（`pending`）が動くフレームだけ緊急**にし、レポートやツールの進行は `startTransition` に載せる。
**`location.hash` を正典にする状態は zustand に写さない**（`useHashRoute` が `useSyncExternalStore` で直接
購読する。写すと hash と store の2か所に持つことになる）。

### Markdown（`components/page/conversation/components/markdown/renderer/markdown-renderer.tsx`）

```
react-markdown
  remarkPlugins: [remark-gfm]
  rehypePlugins: [rehype-raw, [rehype-sanitize, schema], rehype-highlight]
  components: { code: フェンスの言語で MermaidBlock / ChartBlock / 通常 に振り分け, a: 許可スキームだけ }
```

- Markdown 一式は**会話の画面の部品 `conversation/components/markdown/`** に置く（読み手が `<Report>`・
  お伺いの札・質問の記録・目録の見出しで、お伺いの札が答え待ちの札と共有されメインビューの外の部品にまたがるため。
  形は `docs/architecture/adr/0027-markdown-component-entry.md`）。外から引く口は `markdown.tsx` で、
  `import()` で読む描画一式は `renderer/` に入る。`.detail-block` の class 名は口が `detailBlockClassName` で公開し、
  外の部品は CSS を import しない。`split-blocks.ts` は `report/domain/`、`repository-link.tsx` は
  `conversation/components/repository-link/` の部品
- **`schema` は許可リスト**（要素・属性と `class` の語彙 `note` / `badge` / `compare` など）。`style` 属性は
  `schema` の外の `style-allowlist.ts`（`rehypeStyleAllowlist`。`rehypeSanitize` の直前に差す）が、
  許したプロパティと関数（`calc` / `minmax` / `repeat` / `rgb(a)` / `hsl(a)` / `var`）だけで書かれたものを残し、
  エスケープ・コメント・文字列・`url(` / `image-set(` / `src(` / `!important` を含む宣言が1つでもあれば属性ごと落とす。**規約
  （`report-notation.ts`）・schema・部品（`notation.tsx`）・CSS の4つは同じコミットで揃える**
- **記法の class 名は部品に解決する**（`notation.tsx`）。モデルが書くのは骨格（`note` / `badge` など）で、
  **CSS が受ける class 名（`report-` 付き）は tsukumo が付ける**ので、モデルの書いた文字列とセレクタが
  直接つながらない。**知らない class 名と `style` 属性は素通し**（変換は足し算だけ）
- **class の置き換えが掛かるのは `div`・`aside`・`span`・`ol`・`li` だけ**（`REPORT_COMPONENTS`）。`svg` の中身の
  class はハッシュ名にならず CSS に当たらないので、親の要素からの子孫の規則（例: `.report-stat b > svg`）で当てる
- 引用 `> `・ネストしたリスト・水平線・列揃え（`:---:`）・コードスパンの中の HTML は GFM の仕様どおりに
  描ける。`report-notation.ts` は「描けない記法」の迂回を持たない
- **流れる本文**: 欄ごとに入れ物を作り、欄の中の書きかけの Markdown を空行で塊に割り、塊ごとに `memo`（鍵は塊の文字列）。
  描き直すのは末尾の塊だけ。**コードフェンスと HTML ブロックの中の空行では割らない**
  （フェンスは表や見出しに化けないため、HTML は `<details>` の中身が外へこぼれないため。
  HTML は閉じタグが必須の要素だけを深さで数え、閉じタグを省ける `p` / `li` / `td` などは数えない
  ——省略された閉じタグを待つと以降ずっと割れなくなる）。**閉じていないものは末尾の塊の中に
  閉じる**ので、書きかけの間だけその塊の `memo` が効かない
- **描き終えた木はモジュールの LRU（`hast-cache.ts`。上限 200 件）に塊の文字列で持つ**。ターンを行き来して
  `memo` がマウントごと作り直されても、同じ文字列は parse・サニタイズ・色付けを走らせず覚えた木を使う。
  メモリの中だけで、ディスクにもログにも出さない。質問の preview は画像の経路を足す段が付くので持たない

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
- **無限ループ（呼吸・歩き・書く）の easing は、1区間の移動が端末画素の0.5画素刻みになる
  `steps(n, jump-none)`**。振幅は数画素しかなく、`ease-in-out` の毎秒60コマは同じ画素の描き直しなので、
  位置の列を変えずに合成のコマ数だけを減らす（`will-change: transform` では減らなかった）。振幅を変えたら n も合わせる
