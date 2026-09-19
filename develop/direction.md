# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### メインビューの「タブを切り替えたら先頭から読ませる」が効いていない（T-189 の目視中に発見）

`main-view.tsx` は `scrollerRef` を `.main-turns` に付けて `scrollTop = 0` にしているが、
`.main-turns` は `src/ui/styles/main-view.css` で `display:flex; flex-direction:column` を
持つだけで **overflow を持たない**。実際にスクロールしているのは親の
`.layout-region.layout-main`（`src/ui/styles/layout.css` の `overflow-y:auto`）。

実測（偽の駆動、1200x520、ターン3件）: `.main-turns` は `overflowY: visible` で
`scrollHeight === clientHeight`、親の region は `overflowY: auto` で
`scrollHeight 304 > clientHeight 275`。つまり `scrollTop = 0` は無害な no-op になっている。

**T-189 による退行ではない**（今回 CSS もスクロール対象も変えていない）。直すなら
(a) `.main-turns` に overflow を持たせる (b) スクロール対象を親の region に変える の
どちらかで、どちらもレイアウトの見え方に影響するので判断が要る。

### `src/` の置き場所の名前を「どこで動くか」と「何が住むか」に揃える（T-194 の提案。要 採否）

提案書は `docs/research/architecture-placement.md`（2026-09-16 の
`docs/research/architecture-proposal.md` は上書きしていない）。**層の切り方は正しいので変えない。
合っていないのは名前だけ**、というのが結論。

推す案（候補 C）:

| いま                                                      | 新                                                       |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `protocol`                                                | `src/shared/`                                            |
| `core`                                                    | `src/server/core/`                                       |
| `adapter`                                                 | `src/server/adapter/`                                    |
| `ui`                                                      | `src/browser/`                                           |
| `ui/features/layout` `ui/features/character-screen`       | `browser/screen/conversation` `browser/screen/character` |
| `ui/features/{main-view,character-view,sidebar,dispatch}` | `browser/region/<同名>`                                  |

- **依存の辺は1本も変えない。** `core → adapter` 禁止も領域どうしの import 禁止もそのまま
  `test/architecture.test.ts` が落とす（`layerOf` が2段を読めるようになるだけ）
- **`features/` という名前は木から消える。** 中身は画面・領域・provider の3種類が混ざっていて、
  bullet-proof-react の言う「機能のパッケージ」にあたるものは `stores/` のほうに居る。
  `screen` / `region` はどちらも用語集にある語（`data-region` 属性が既にコードにある）
- **素案の `lib/` `utils/` は採らない。** サーバ側に「外に触らずドメインも知らない」ファイルは
  実測 0 件（`tsukumo-home.ts` も `bundled-path.ts` も `node:` に触るので境界）。
  helm-yadokari の `utils/fs.ts` にあたるものは tsukumo では `adapter` に入るので、
  `utils/` を足すと基準が1ファイルで食い違う。`server/lib/` は実体が2つ出たら作る

段階（各段は単独で `bun run check` が通る）:

1. **ファイルを動かさない。** `README.md` のツリーが 2026-09-16 の `adapter/` 分割前のままなので
   実態へ直し、`docs/architecture.md` の置き場の表に「実行場所」列を足す（2〜3ファイル）
2. `protocol` → `shared`、`ui` → `browser`（移動 111）。**ここで止めても一貫した形になる**
3. `core` / `adapter` → `server/` の下へ（移動 43）
4. `browser/features/` を `screen/` と `region/` に割る（移動 63。目視確認が要る）

`CLAUDE.md` は原則2（層の名前）・原則3（`src/server/adapter/`）・原則5（例外の一覧から
`features/` が落ちる）の3つだけ直す。**この提案の段階では `CLAUDE.md` を直していない。**

決めてほしいこと: (a) `server`/`browser` か `backend`/`frontend` か、(b) 段3（`server/` への
入れ子）まで行くか段2で止めるか、(c) 会話画面の組み立てを `main.tsx` から `screen/` へ下ろすか。

### `src/ui/` を vercel の react-best-practices に当てた結果（T-197。要 採否）

出典は `vercel-labs/agent-skills` の `skills/react-best-practices`（8分類70件。`SKILL.md` と
`AGENTS.md` を 2026-09-20 に取得）。**当てた範囲は `src/ui/` の55ファイル**（`.ts` / `.tsx` が44、
`*.module.css` が7＋`theme.css`、`*.d.ts` が3）。

前提として押さえた数字:

- **サーバは 100ms ごとにイベントをまとめて1フレーム押す**（`src/core/session-manager.ts:34`
  `EVENT_BATCH_INTERVAL_MS = 100`）。**ターンが流れている間、下の「毎フレーム」は毎秒10回**
- `src/ui/stores/session.tsx:126` が `value={{ state, connection, dispatch }}` を**毎レンダー
  新しいオブジェクトで**配るので、`useSession()` を呼ぶ部品は**読んでいる値が変わっていなくても
  全部**再描画される。該当するのは `TurnSelectionProvider` / `MainView` / `CharacterView` /
  `Sidebar` / `SessionInfo` / `CharacterEdit` / `CharacterScreen` / `CharacterCreate` /
  `Dispatch` / `Composer` / `TurnStatus` / `PendingAnswer` / `PermissionAsk` / `QuestionAsk`
- `src/ui/` に `useMemo` は0件、`memo` は1件（`report.tsx:32` の `ReportBlock`）、
  `useCallback` は1件（`session.tsx:106`）

**T-189 で直った分（`layout.tsx` の ref 書き込み・`turn-selection.tsx` の effect・`portrait.tsx` の
同期 setState・依存配列）と、oxlint が落とすものは下に入れていない。**

#### 当たったもの（17件。直す価値の順）

1. **`rerender-memo` — `src/ui/features/sidebar/sidebar.tsx:54` の `<TaskBoard>` が、閉じている間も
   毎フレーム表を組み直す。** `<dialog>` は開閉を `showModal()` / `close()` で切り替える作りなので
   **常にマウントされている**（`task-board.tsx:30-41`）。`Sidebar` は `useSession()` を読むので
   毎フレーム再描画され、そのたびに `task-board.tsx:97-99` が `develop/tasks.json` の全件
   （いま24件）× 7列を組み直す。**画面に1ピクセルも出ていない間の仕事。**
   直し方: `TaskTable` を `memo` で包んで `tasks` だけを props に取る、または `props.open` が
   `false` のとき `<dialog>` の中身を描かない（`<dialog>` 自体は残す）。
2. **`js-index-maps` — `src/ui/features/sidebar/task-board.tsx:122` が行ごとに `taskReadiness` を
   呼び、その中（`src/protocol/task-summary.ts:75-77`）で毎回「未完了のID」の `Set` を作り直す。**
   24行なら `Set` を24個作って 24×24 走査する。1と重なって毎フレーム起きている。
   直し方: `Set` は表で1回だけ作り、行へ渡す（`taskReadiness` の引数を `tasks` から
   `unfinishedIds: ReadonlySet<string>` に変える）。**1を直すと発生頻度は下がるが、
   表を開いている間は残る。**
3. **`rerender-memo` — 同じ `mainViewTurns(mainViewEntries(state))` を毎フレーム2回計算している。**
   `src/ui/stores/turn-selection.tsx:51`（結果から `id` だけ取って捨てる）と
   `src/ui/features/main-view/main-view.tsx:28-30`。中身は `groupIntoTurns` →
   `keepOnlyInterimReports` → `markSupersededSteps` → `limitTurnEntries` の4パス
   （`src/protocol/main-view.ts:90-95`）で、記録は最大20ターン分ある
   （`session-state.ts:30` `MAX_SESSION_STATE_TURNS`）。
   直し方: 導出を `<TurnSelectionProvider>` に1本化して、`turns` を Context に載せて
   `<MainView>` へ配る（`activeTurnId` と同じ経路）。
4. **`rerender-memo` — `src/ui/features/main-view/report.tsx:16` の `splitReportBlocks` が毎フレーム
   レポート全文を走査する。** `ReportBlock` の `memo`（32行目）が守っているのは
   **Markdown → React の変換だけ**で、**割る仕事そのものは毎回**走る。`split-blocks.ts:55-70` は
   1行ずつ正規表現を当てる。`Report` / `Turn` / `Step`（`turn.tsx:21,62`）にも `memo` が無いので、
   出ているターンの全ステップが毎フレーム通る。
   直し方: `Report` を `memo`（props は `markdown` の文字列1つなので浅い比較で足りる）。
5. **`rerender-defer-reads` — `src/ui/features/dispatch/pending-answer.tsx:44` と `:79` が
   `const { dispatch } = useSession()` で、`dispatch` をコールバックでしか使わないのに
   state の変化を全部購読している。** `QuestionAsk` は選択肢を `useState` で持つ箱なので、
   毎フレームまるごと描き直されている（選択肢の数だけ `<button>` / `<label>` を作り直す）。
   直し方: `SessionContext` を「state を配る Context」と「`dispatch` を配る Context」に割る。
   `dispatch` は `useCallback(..., [])` で既に安定しているので、割るだけで
   `PermissionAsk` / `QuestionAsk` はフレームで再描画されなくなる。
6. **`rerender-derived-state` — 生の `state` ではなく導出した値を購読するべき部品が3つ。**
   `src/ui/features/dispatch/dispatch.tsx:14` が要るのは `state.pending.length > 0` の真偽1つ、
   `src/ui/features/dispatch/turn-status.tsx:33` が要るのは `turnStartedAt` / `turnFinishedAt` /
   `turnInProgress` の3つ、`src/ui/features/sidebar/sidebar.tsx:23` が要るのは
   `runningTools` / `finishedTools` / `tasks` の3つ。いまはどれも `state` 全体に繋がっている。
   直し方: 5と同じ手当て（`useSyncExternalStore` + セレクタ、または Context の分割）。
   **5と6は同じ1回の作業になる。**
7. **`rerender-transitions` / `rerender-use-deferred-value` — `src/ui/stores/session.tsx:95` の
   `applyOne(frame)` が緊急の更新として走る。** ターンが流れている間は毎秒10回、上の1〜4を
   含む木が同期で描き直されるので、その間の `<textarea>`（`composer.tsx:143`）への入力と
   競合する。
   直し方: `startTransition(() => applyOne(frame))`。**ただし `pending`（許可要求・質問）の
   到着まで遅らせてよいかは判断が要る**ので、フレームの種類で分けるか、`useDeferredValue` を
   `<MainView>` 側に置くかの選択になる。
8. **`rendering-activity` — `src/ui/main.tsx:49` の `<div hidden={screen !== "conversation"}>`。**
   `hidden` で隠しているだけなので、**キャラクター画面を開いている間も** `MainView` /
   `Sidebar` / `TaskBoard` / `CharacterView` が毎フレーム再描画され続ける（1〜4がそのまま裏で
   動く）。React は 19.2 から `<Activity>` が安定していて、このリポジトリは 19.3.0
   （`package.json`）。
   直し方: `<Activity mode={screen === "conversation" ? "visible" : "hidden"}>` に替える。
   **`hidden` で隠している理由（下書き・選んでいるターン・スクロール位置を失わない）は
   `<Activity>` でもそのまま満たされる。**
9. **`js-batch-dom-css`（レイアウトスラッシング） — 描画中に `getComputedStyle` を呼んでいる。**
   `src/ui/features/character-screen/appearance-color.ts:125` の `readToken` が
   `getComputedStyle(document.documentElement).getPropertyValue(...)` で、これを
   `character-edit.tsx:150` が `OUTFITS.map` の中から**衣装の数だけ（4回）**、
   `character-edit.tsx:64` が1回、`character-screen.tsx:86` が `COLOR_FIELDS.map` の中から
   **3回**、`character-create.tsx:48` が1回呼ぶ。さらに `character-screen.tsx:45-48` は
   **書いて（`applyAppearanceColorOverride`）→ setState → 描画中に読む**の順なので、
   `<input type="color">` を動かしている間ずっと書き／読みが交互に起きる。
   直し方: 読みを描画の外（イベントハンドラ）へ移し、1回読んだ値を state に持つ。
10. **`js-cache-function-results` — 9と同じ `readToken`。** 呼ぶたびに
    `getComputedStyle()` の戻り（`CSSStyleDeclaration`）を作り直している。1回のレンダーで
    最大4回（`character-edit.tsx` の衣装のループ）。9を直すと一緒に消える。
11. **`rerender-use-ref-transient-values` — `src/ui/features/layout/layout.tsx:72,90,112` の
    `setSplit` が `pointermove` ごとに走る。** 仕切りの位置は「ドラッグ中だけの過渡的な値」で、
    最終的に効くのは `--layout-*` の CSS 変数だけ（`layout.tsx:41-52`）。
    毎 `pointermove` で `<Layout>` が再描画される（4領域の中身は `<Root>` が作った同じ要素
    なので React が飛ばすが、grid とスタイルの3オブジェクトは作り直している）。
    直し方: ドラッグ中は `gridRef.current.style.setProperty("--layout-row-top", ...)` を直接
    書き、`pointerup` のときだけ `setSplit` する。
12. **`advanced-use-latest` / `advanced-event-handler-refs` — `src/ui/features/layout/layout-resizer.tsx:26-57`
    のハンドラが `pointerdown` の時点の `props` を握り続ける。** そのせいで
    `layout.tsx:75,93,116` の `onCommit` は `{ ...split, topLeft: percent }` と書かざるを得ず、
    `layout.tsx:54-56` に「`split` は pointerdown の時点のもの」という**回避策の注記が要る状態**に
    なっている（いまは仕切りを同時に2本動かせないので**動作は正しい**）。
    直し方: `onChange` / `onCommit` を ref（または `useEffectEvent`）に載せて常に最新を呼ぶ。
    そうすると `layout.tsx` 側は `setSplit((current) => ...)` の形に揃い、注記が要らなくなる。
13. **`client-swr-dedup` — `src/ui/components/portrait.tsx:74` の `fetch` に重複除去も
    キャッシュも無い。** `/character/<file>` は `src/adapter/server.ts:404` で
    `cache-control: no-store` を返すので**ブラウザのキャッシュも効かない**。結果:
    (a) `speak` で表情が変わるたびに SVG を取り直す（4表情を行き来しても毎回往復）、
    (b) 取り直しが終わるまで `portrait.tsx:89` が `undefined` を返すので**中身が空の瞬間が挟まる**、
    (c) `character-edit.tsx:95` の立ち絵の並びは最大4枚を同時にマウントするので4本同時に飛ぶ。
    直し方: URL をキーにしたモジュール単位のキャッシュ（`vendor-script.ts:8` と同じ手口）。
    **`no-store` は画面から素材を差し替えられるための設定なので、`character-changed` が来たら
    キャッシュを捨てる必要がある。** → **T-203（TanStack Query）と重なる。**
14. **`rendering-hoist-jsx` — `src/ui/features/sidebar/task-board.tsx:85-95` の `<thead>`。**
    7つの `<th>` は完全に静的なのに毎フレーム作り直している。1を直すと一緒に消える。
15. **`js-combine-iterations` — `src/ui/features/sidebar/task-list.tsx:30-32`。**
    `todo` / `doing` / `done` を数えるのに `filter` を3回、全件に対して回している。
    `Sidebar` の見出しなので毎フレーム。1回のループで3つ数える形にする。
16. **`js-hoist-regexp` — `src/ui/features/main-view/markdown/split-blocks.ts:79` の
    `isFenceDelimiterLine`。** 正規表現リテラルを関数の中に置いているので、**レポートの行数だけ**
    `RegExp` を作る（4のとおり毎フレーム全行を通る）。同じファイルの他の3つ
    （`HTML_TAG_PATTERN` など）はすでにモジュール定数になっているので、揃える。
    `src/ui/features/dispatch/command-suggestions.tsx:21` の `/\s/` も同じ（こちらは
    `Composer` のレンダーごとに1回なので、揃える以上の意味は無い）。
17. **`client-localstorage-schema` — 保存キーに版が無い。**
    `src/ui/features/layout/split.ts:18` の `"tsukumo-layout-split"` と
    `src/ui/features/character-screen/appearance-color.ts:30` の `"tsukumo-appearance-color"`。
    **`try` / `catch` と値の検証はどちらもすでに満たしている**（ルールが求めるもう半分）ので、
    残るのはキーに `:v1` を足すことだけ。**いまの形を変えるときに困る**というだけの話なので、
    直す価値は低い。

#### 当たらなかった分類・ルール（理由つき）

**分類ごと:**

- `async-`（6件）: RSC / サーバ側の `await` の並べ方の話。`src/ui/` に `await` を跨ぐ
  データ取得が無い（唯一の非同期は13の `fetch` と `readDataUrl`）
- `server-`（10件）: RSC / Next.js のサーバ実行前提。tsukumo のサーバは束ねた JS と素材を配るだけ
  （`src/adapter/server.ts`）で、React をサーバで描かない
- `bundle-`（6件。**タスク本文が触れていない分類**）: `bundle-dynamic-imports` /
  `bundle-analyzable-paths` / `bundle-preload` は `next/dynamic` とファイルシステムルーティング
  前提。`bundle-barrel-imports` は**該当なし**（`src/` に `index.ts` が0件）。
  `bundle-conditional` と `bundle-defer-third-party` は**すでに満たしている**
  （mermaid / Chart.js はその記法が出たときだけ読む。`markdown/vendor-script.ts`）

**当たる分類の中で、すでに満たしている・該当が無いもの:**

- `rerender-no-inline-components`: 該当なし。部品はすべてモジュール直下に置かれている
- `rerender-lazy-state-init`: 満たしている（`layout.tsx:30` `useState(loadSplit)`、
  `character-screen.tsx:41`、`turn-status.tsx:34`、`character-create.tsx:48`）
- `rerender-derived-state-no-effect`: 満たしている。`turn-selection.tsx:60-70` は
  `useEffect` ではなくレンダー中に前後を見比べる形
- `rerender-functional-setstate`: 満たしている（`pending-answer.tsx:121-144`、
  `layout.tsx` の `onChange`）。唯一の例外が12の `onCommit`
- `rerender-simple-expression-in-memo`: 該当なし。`useMemo` が0件
- `rerender-dependencies`: 満たしている。`character-view.tsx:65` が入れ物を分解してから
  依存に渡す（理由も 51-61行目に書かれている）
- `rerender-split-combined-hooks`: 分けるべき計算を抱えた hook が無い（`useSession` の分割は
  5/6に入れた）
- `rerender-move-effect-to-event`: 該当なし。`useEffect` は規約（`docs/coding-standards.md`）の
  4類型に絞られていて、操作の結果を effect で追っている箇所が無い
- `rerender-memo-with-default-value`: 該当なし。`memo` した部品は `ReportBlock` 1つで、
  非プリミティブの既定値を持つ props が無い
- `rendering-animate-svg-wrapper`: **満たしている。** 動きは wrapper の `<div>`
  （`portrait.tsx:124,132`）に `data-motion` で当たり、`portrait.module.css:50-72` も
  `.portrait[data-motion=...]` を animate している。SVG 要素自身は動かしていない
- `rendering-script-defer-async`: 満たしている。`server.ts:357` は
  `<script type="module">`（既定で defer）
- `rendering-conditional-render`: 該当なし。`&&` の左辺を全部見たが、`turn.tsx:26,27,31,90`・
  `main-view.tsx:54`・`portrait.tsx:133` はいずれも真偽値（`!== undefined` / `> 0` /
  `=== "raster"` / boolean のフィールド）で、`0` や `""` が漏れる形が1つも無い
- `rendering-content-visibility`: 該当なし。いちばん長い一覧でも
  `MAX_RECENT_FINISHED_TOOLS = 50`（`session-state.ts:23`）＋タスク24件で、
  `content-visibility` や仮想化が要る長さではない
- `rendering-hydration-no-flicker` / `rendering-hydration-suppress-warning`: SSR が無い
- `rendering-svg-precision`: 立ち絵の SVG は利用者のキャラクターパックの素材で、`src/` に無い
  （原則4）
- `rendering-usetransition-loading`: 該当なし。「読み込み中」を state で持つ箇所が無い
  （`portrait.tsx:89` は `undefined` を返すだけ）
- `rendering-resource-hints`: 採らない。同梱スクリプトは「その記法が出たときだけ読む」のが
  要件（`docs/requirements.md` 4.2）なので、先読みは要件と逆
- `client-event-listeners`: 該当なし。global に張るのは `screen.tsx:46` の `hashchange` 1つで、
  読み手は `<Root>` だけ。`layout-resizer.tsx:55` は要素に張って `pointerup` で外す
- `client-passive-event-listeners`: 該当なし。`wheel` / `touchstart` の listener が0件
  （ドラッグは pointer イベント。`preventDefault` が要る `mousedown` は
  `command-suggestions.tsx:70` の1つで、passive にできない）
- `js-cache-property-access` / `js-early-exit` / `js-length-check-first` / `js-min-max-loop` /
  `js-set-map-lookups` / `js-flatmap-filter`: 該当なし。ループの中で同じプロパティを読み直す
  箇所・`sort` で最大最小を取る箇所・`filter().map()` の連鎖・配列を `includes` で舐める
  ホットパスが `src/ui/` に無い（`commandSuggestions` はすでに `Map`、
  `commandCandidates` はすでに `Set`）
- `js-tosorted-immutable`: 満たしている（`command-suggestions.tsx:39,42` が `toSorted`）
- `js-request-idle-callback`: 該当なし。描画の後回しにできる副次的な仕事（計測・送信）が無い
  （会話をプロセスの外に出さないので、そもそも analytics が無い）
- `advanced-init-once`: 満たしている（`main.tsx:65` の1回と `vendor-script.ts:8` の Map）
- `advanced-effect-event-deps`: 該当なし。`useEffectEvent` をまだ使っていない
  （12で入れるなら、そのとき守る規則になる）

#### T-203（TanStack Query）と重なる分

**13（`client-swr-dedup`）だけ。** `src/ui/components/portrait.tsx:74` の `fetch` が
`src/ui/` で唯一の HTTP 取得で、T-203 がこれを置き換えるなら重複除去とキャッシュは
そちらで解ける。**ただし `/character/*` が `no-store` である（`server.ts:404`）ことと、
`character-changed` が来たら捨てる必要があることは T-203 側でも要る判断なので、
そのタスクへ申し送る。** 他の16件はどれもデータ取得ではないので重ならない。

#### 付記（ルールの外で見つけた1件）

**`src/ui/features/main-view/turn.tsx:89` が CSS Modules を通していない。**

```tsx
<section className={step.interim ? "main-step is-interim" : "main-step"}>
```

同じファイルの81行目は `styles["main-step"]` / `styles["is-interim"]` で引いているのに、
ここだけ生の文字列。`.main-step` と `.main-step.is-interim` は
`main-view.module.css:76,91` に**実在する**が、class 名は組み立てのたびにハッシュ化されるので
**この `<section>` には枠も地も当たっていない**。効いていないのは「追い越されていない
中間レポート」と「通常のステップ」の見た目で、畳んだ中間レポート（81行目の `<details>`）は
正しく当たっている。T-191（CSS Modules への移行）の取りこぼしと思われる。
**目視で確かめていない**（コードと CSS の照合だけ）ので、直すなら目視確認を付ける。
