# コーディング規約: React

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: React の部品とフックの書き方（`useEffect` の4類型と代わりに使うもの、ref・時計、部品の定義の形、メモ化、条件付きの描画、zustand の store、TanStack Query）の理由と例外を持つ。
読む時: `src/browser/` の部品・フック・store を書くとき（`.claude/rules/react.md` の行の括弧の節を確かめるとき）。
直す時: React の書き方の規約・その検査（oxlint の React のルール・`test/architecture/clock.test.ts` など）を変えたとき。

## React

React 19。関数コンポーネントと Hooks だけを使う（クラスコンポーネントは書かない。`forwardRef` も
使わない — 19 では `ref` がそのまま props で渡る）。

### useEffect は4類型だけ

`useEffect` は **React の外にある世界と同期するためのもの**。書いてよいのは次の4つで、
当てはまらないものは書かない。

| 類型                             | 例                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 外部システムの購読               | WebSocket の接続（`browser/stores/session.ts` の `useSessionConnection`）                                                       |
| React の外にある状態への書き込み | `document.title`・CSS カスタムプロパティ・`dialog.showModal()`・`scrollTop`                                                     |
| タイマー                         | 経過時間の1秒刻み（`browser/components/page/conversation/components/dispatch/components/turn-status/hooks/use-turn-status.ts`） |
| 外部からの読み込み               | `fetch`・vendor script の読み込み                                                                                               |

4類型から外れるものをどうしても書くときは、**なぜ下の代替では書けないのか**をコメントに残す
（「コメント」節の「今の挙動の制約・前提」にあたる）。

### useEffect の代わりに使うもの

`useEffect` を書きたくなったら、先にこの表を見る。

| やりたいこと                      | 使うもの                                         |
| --------------------------------- | ------------------------------------------------ |
| props / state から計算できる値    | レンダー中に計算する（state にしない）           |
| props が変わったら state を捨てる | `key` で部品ごと作り直す                         |
| 利用者の操作で起きること          | イベントハンドラ                                 |
| effect から最新の値を読みたいだけ | `useEffectEvent`（React 19.3 にある）            |
| 外部ストアの購読                  | zustand の store・`useSyncExternalStore`         |
| DOM ノードの取り付け・取り外し    | ref コールバック（React 19 は cleanup を返せる） |

`useEffectEvent` で包んだ関数は**レンダー中には呼べない**（React が投げる）。呼んでよいのは
effect の中と、イベントハンドラ・そこで登録した寿命の長いリスナの中
（`browser/components/ui/layout-resizer/layout-resizer.tsx` の、ドラッグの間だけ生きる `pointermove`）。

**画面を離れるとアンマウントされる部品（`components/app/layout.tsx` の `OVERLAY_SCREEN`）では、一回限りの合図や
「もう見せた」の印を部品の state に持たない。** React の外（モジュールの store）に持つ——
アンマウントで消える state に印を仕込むと、再訪のたびに初期値へ戻って演出が勝手にやり直しになる。

いちばん多い誤りは、**props や state から計算できる値を state に入れて effect で更新する**もの。
レンダーのたびに計算すればよく、effect を挟むと「計算し終わる前の1フレーム」が画面に出るうえ、
更新の連鎖が起きる。

### 依存配列を手で間引かない

`react-hooks(exhaustive-deps)` が要求する依存を、コメントで理由を書いて外す形にしない。
外したくなるのは、たいてい「その値は**読むだけ**で、変わっても effect を張り直したくない」
ケースで、それは `useEffectEvent` に包めば依存から正しく消える。

### レンダー中に ref を読み書きしない

`ref.current` に触ってよいのはイベントハンドラと effect の中だけ。レンダー中に書くと、React が
レンダーをやり直したり捨てたりしたときに値がずれる。「最新の値をクロージャから読みたい」だけなら
`useEffectEvent`。

### 描画中に時計を読まない

描画中に `nowEpochMilliseconds()` などの時計を読まない（時刻は state か props で受ける）。

React Compiler は引数の無い呼び出しを依存に数えず、時刻の読み取りごと覚えてしまうので、
タイマーで描き直しても時刻が進まない。単体テストには Compiler が掛からないので、
E2E まで気づけない。読んでよいのは、effect・state の初期化関数・タイマーとリスナーの手・
`on…` の名前のイベントの手の中。`test/architecture/clock.test.ts` の「描画中に時計を読む箇所」が
落とす。

### 部品は `function` で書く

`ReactElement` を返す関数は**関数宣言**（`function Name(props: Props): ReactElement`）で書く。
`const Name = (props) => ...` の形にしない。定義の形が2つあると、**並び順の規約
（「外から使うもの → その内部で使うもの」）が守れなくなる**ことがある——巻き上げがあるから
「使う側より下に置く」が書けるのであって、`const` は宣言より前で使えない。

**例外は `memo` で包むときだけ。** `const <部品名> = memo(<部品名>View)` と書き、中身は
`function <部品名>View(...)` の関数宣言のまま下に置く（`components/page/conversation/components/main-view/components/report/report.tsx` の
`ReportBlock`）。**`memo(function X() { ... })` の形にしない** — 定義が `const` の右辺に入ると、
その部品だけ本体が上に来て並び順が逆になる。`memo` 自体をいつ書くかは次の節（「手でメモ化
しない」）。

この規約は**部品（`ReactElement` を返す関数）とフック**にかかる。JSX を値として持つだけの定数
（中身が完全に静的な見出し行など）は関数ではないので `const` のまま。

### 手でメモ化しない

`memo` / `useCallback` / `useMemo` を手で書かない。メモ化は `vite.config.ts` に入れた
React Compiler（`@vitejs/plugin-react` の `compiler`。中身は `oxc-transform-react`）に任せる——
組み立てがコンポーネント・フックの中身を見て、値・関数・部品の描き直しを自動で減らす。
Compiler が最適化を諦める部品（描画中に ref を読み書きする、フックを条件の中で呼ぶなど）を
書くと `pnpm run build` が落ち、どこの何が理由かがエラーに出る（`panicThreshold: "all_errors"`）。
諦めた部品を黙って素通しさせないため。Compiler が対応していない書き方（オブジェクトリテラルの getter など、エラーが
`Todo` や `BuildHIR` を名乗るもの）でも落ちるので、書き方を変えて避ける。

残してよいのは、Compiler だけでは足りない理由が具体的にあるときだけで、その理由を
使う側に1行のコメントで書く。今のところの2つの理由:

- **その部品の描き直し回数を数える単体テストが、Vitest の実行を通る。** Compiler は
  consumer が `client` の環境にだけ掛かり、Vitest の実行（SSR 相当。
  `server.transformRequest` を `ssr: true` で呼ぶ）には掛からないので、`memo` を外すとテストの前提が崩れる（`report.tsx` の `ReportBlock`）
- **oxlint の `react-hooks(exhaustive-deps)` が、依存配列に置いた値の再生成を理由に落ちる。**
  この lint は静的解析で Compiler の自動メモ化を知らないので、`useCallback` を外すと
  lint が落ちる（`chat-view/hooks/use-stick-to-bottom.ts` の `stickToBottom`）

oxlint の `react(preserve-manual-memoization)` が手のメモ化を拒むときは、形を曲げない
（lint を外さず、そのまま消す）。手のメモ化を残す理由が上の2つに当たらず、作り直されても
見た目と操作が変わらなければ Compiler に頼った形で足りる。確かめ方は、組み立てた画面
（`pnpm run build`。Compiler が掛かっている）で、変わる要素に `dataset` で印を付け、
操作のあとも `isConnected` で残るかを見る。印が残れば見た目と操作は変わっていない。

### 部品の中で部品を定義しない

部品（`ReactElement` を返す関数）の内側で別の部品を定義しない。定義は必ず親の外
（モジュールのトップレベル）に置き、変わるデータは props で渡す。内側で定義すると、
親がレンダーされるたびに内側の部品の型が新しく作られる。React はそれを「別の部品」だと
見なして、その下の DOM と state を作り直す（入力欄のフォーカスが飛ぶ・演出がやり直しに
なるといった不具合になる）。

`react/no-unstable-nested-components`（`.oxlintrc.json` で `"error"`）がこれを機械的に落とす
（「仕組みをヒューリスティックより優先する」）。例外は設けない。

### 入力の種類で分けるときはブラウザの判定に任せる

touch・マウス・キーボードで出し分けるときは、`pointerType`・`:focus-visible` などブラウザの判定に任せ、
`pressing` のような印でイベントの到着順を前提にしない。順序は入力ごとに違う（マウスは
`pointerdown` → `focus` → `pointerup`、touch は `pointerup` のあとに互換の `mousedown` でフォーカスが入る）ので、
マウスの順序を仮定した印は touch で効かない。テストも実際の順序で撃つ（誤った順序を撃つと、誤った実装が通る）。
実例は `use-file-excerpt-peek.ts` の `target.matches(":focus-visible")`。
順序を前提にした実装かは構文木から見分けられないので、lint では落とさない。

### 条件付きの描画は `&&` で書く

JSX の中で「条件が立ったときだけ描く」は `{条件 && <部品 />}` と書き、`{条件 ? <部品 /> : null}` /
`{条件 ? null : <部品 />}` と書かない。`null` を書かずに済み、描かない側の枝を読まなくてよくなる。
三項演算子は**両方の枝で何かを描くとき**だけ使う。

**`&&` の左辺は `boolean` に限る。** `0` や `NaN` は偽でもそのまま描かれる（`{items.length && <List />}` が
「0」を出す）。`boolean` でない値は `!== undefined`・`!== ""`・`> 0` のような比較で `boolean` にしてから
渡す。否定で書きたくなったら `!(…)` で包まず、比較の向きを変える（`=== undefined` を `!== undefined` に）。

この左辺の型は lint では落とせない。oxlint には eslint-plugin-react の `jsx-no-leaked-render` に当たる
ルールが無く、代わりになる `typescript/strict-boolean-expressions` は型情報付きの lint
（`oxlint-tsgolint` の導入）が要るうえ、JSX に限らずすべての条件式に掛かる。

### zustand の store

`browser/stores/` に置く「画面全体で共有する状態」は zustand の `create()` で書く
（`stores/inquiry-jump.ts`）。`Context` の `Provider` は作らない——store は `create()` が返す
hook そのものが持ち、部品はどこからでもその hook を呼べる。

```ts
export const useQuestionScroll = create<QuestionScrollState>()((set) => ({
  signal: 0,
  requestScroll: () => set((state) => ({ signal: state.signal + 1 })),
}))
```

部品は**自分が読む値だけ**をセレクタで購読する（`useQuestionScroll((state) => state.signal)`）。
セレクタが**その場で配列・オブジェクトを新しく作って返す**とき（複数のフィールドをまとめて
返す、フィルタした配列を返すなど）だけ `useShallow` で包む——包まないと、参照が毎回変わり
読んでいる値が変わっていなくても描き直しが止まらない（zustand のセレクタも中は
`useSyncExternalStore` なので、同じ姿から毎回違う参照が返ると描き直し続ける）。1つのフィールドだけを
返すセレクタには要らない。姿から重い導出を返すときは、`useShallow` ではなく姿をキーに覚える
（`stores/main-view-turn.ts` の `mainViewTurnsOf`）。

store には値だけでなく、React に属さない口も同じく持たせる（`stores/session.ts` の `dispatch` や
`receive`）。store の外の資源（接続など）は `create()` に渡す関数の閉包に置き、購読させない。
外の世界と繋ぐ `useEffect` は store の横の hook にして、画面の根で1回呼ぶ（`useSessionConnection`）。
`location.hash` のように正典が React の外にある値は zustand に写さず、`useSyncExternalStore` で
直接購読する（`stores/location-hash.ts`）。

テストで姿を差し込みたいときは `Provider` の代わりに store を直接操作する。`getState()` /
`setState()` は React の外からも呼べるので、`afterEach` で初期値に戻す（`getInitialState()` を
`setState(..., true)` で丸ごと入れ直す。会話の姿は `test/browser/session-store.ts` の `putSession` が
戻してから入れる）
（`test/browser/features/current-work/current-work.test.tsx`）。

### TanStack Query と queryOptions

`fetch` を `queryOptions` へ置き換えるときは、失敗時の挙動が変わらないかを見る。既定では
再試行が3回掛かり、約7秒骨組みのまま待つ。すぐ控えへ倒していた読み取りなら `retry: false`
を付ける（`src/browser/domain/context-usage.ts` など）。
