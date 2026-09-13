# 現在の状態

最終更新: 2026-09-13（同日 T-099 で移行の段6（メインビュー・Markdown の unified 化）を終え、
`src/presentation/` が無くなった。**移行前の4層は `infrastructure/`（`view-port.ts` だけ）を残すのみ**
（`usecase/` は消費先が無くなり空になった）。同日 T-098 で移行の段5（キャラビュー）を終え、残るビューはメインだけになった。同日 T-097 で移行の段4（入力欄）を終え、`multiSelect` の未解決事項を閉じた。同日 `/plan-tasks` でデザイン再考の指示を T-102 / T-103 に起こした。2026-09-12 に T-058 で、素の TUI にレポートの HTML タグが漏れる件の方式を決めた（tsukumo が `systemPrompt` の append で足す。実装は T-059）。同日 `/plan-tasks` で T-069 の結論から出た実装3件と個別ビューの撤去を T-082〜T-085 に起こし、Idiomorph の同梱は T-070 の本文を差し替える形にした。同日 T-069 で描画の技術を決め（フレームワークは入れない）、T-072 で入力欄のキー割り当てを入れ替えた。同日 `/plan-tasks` で届いた指示10件を T-072〜T-081 に起こし、HTML 描画のライブラリ（React）の検討は既存の T-069 に統合した。T-071 でキャラビューを立ち絵主役の形に作り直した。同日 `/plan-tasks` で描画の技術を T-069、サイドバーのスクロール位置が戻る件を T-070、
吹き出しの見えづらさを T-071 に起こし、done 7件（T-042 / T-048 / T-060 / T-061 / T-066 / T-067 / T-068）を
`docs/history/tasks-archive.md` へ移した。同日 `/loop /next-task` で T-067 / T-068 / T-060 / T-066 を完了（これで `/loop` に載せられるタスクは無くなった）。同日 `/plan-tasks` でセッション情報が出ない件を T-067 に、`/` 補完が効かない件を T-068 に起こした（どちらも現物で再現を確認）。同日の `/plan-tasks` でキャラクターの切り替えを T-064 / T-065 に、最新の吹き出しを領域の縦中央に置く件を T-066 に起こした。同日の `/plan-tasks` で TUI の HTML タグの件を T-058 / T-059 に、ポートの衝突を T-060 に、サイドバーのスクロール範囲を T-061 に、レポートの見やすさを T-062 / T-063 に起こした。承認を得て T-042（旧経路の撤去）と T-048（グローバル導入）を完了。同日 `/loop /next-task` で T-050〜T-057 の8件を完了し、done 10件を
`docs/history/tasks-archive.md` へ移した。同日、`/plan-tasks` で箱の選択肢の比較を T-057 に起こし、T-046 の論点を広げ、
サイドバーの改善を T-054〜T-056、吹き出しの分割を T-053、補完の改善を T-050〜T-052 に起こし、
progress.md の 2026-09-11 分を `docs/history/progress-archive.md` へ移した。2026-09-11 に方針を全面的に見直して
Claude Code の TUI を捨て、Agent SDK で動かすことに決めた。リポジトリの立ち上げは 2026-09-09）

スタックは **Bun + TypeScript**、チェックコマンドは **`bun run check`**。
**旧方針（サイドカーが transcript を覗き見る）の実装は 2026-09-12 に撤去した**（T-042）。
**新方針は `docs/history/direction.md` 2026-09-11「方針の全面見直し」が正典**で、
`CLAUDE.md` / `docs/` / `README.md` はそれに沿って書き換え済み。
**`develop/direction.md` は空**（2026-09-12 に届いた指示と T-069 の結論は T-058〜T-085 に起こし、
`docs/history/direction.md` へ移した）。

## 完了したこと（このセッション）

### 2026-09-13 移行の段6（メインビューを React にし、Markdown を unified に置き換え）

**T-099 完了、T-063 を吸収して閉じた。** メインビュー（やり取りのタブ・レポート・ツールの行・
質問の記録）を `src/ui/main-view/`（`MainView` / `TurnTabs` / `Turn` / `Report` / `ToolRun` /
`QuestionRecord`）にし、Markdown の変換を自前の行ベースパーサから `src/ui/report/`
（`markdown.tsx` = react-markdown + remark-gfm + rehype-raw + rehype-sanitize + rehype-highlight、
`sanitize-schema.ts`、`MermaidBlock` / `ChartBlock`、`split-blocks.ts`）へ置き換えた。
**T-063（引用・ネスト・水平線・列揃え）が閉じた**（unified がそのまま描く。列揃えは GFM の
`align` を rehype-sanitize の schema で通す）。`src/protocol/main-view.ts` に `groupIntoTurns` /
`limitTurnEntries` / `toolVisibility` を移し、`src/ui/layout/` に `Layout` / `LayoutResizer` を
移して `src/ui/main.tsx` を `<div id="app">` への単一 root（`<Layout main=... sidebar=...
character=... dispatch=...>` の props スロットで4領域を合成）にまとめた。

旧の `src/presentation/` を丸ごと削除（`view.ts` / `report-html.ts` / `report-notation.ts` /
`browser/` 一式）。`report-notation.ts` は `src/core/report-notation.ts` に移し、「描けない」の
迂回指示を外した。`src/infrastructure/view-server.ts` の静的配信を `src/core/server.ts` に合流
（design.md 5章の想定どおり http+ws を1ファイルに）。`browser-bundle.ts` → `core/bundle.ts`
（browser.js のビルドは削除）、`bundled-path.ts` → `core/bundled-path.ts`（core が使うため）。
`src/usecase/`（`event-sink.ts` / `throttle.ts` / `view-publish.ts`）は消費先が消えたため削除し、
ディレクトリごと空になった。`vendor/idiomorph.min.js` と `highlight.min.js` を削除
（色付けは rehype-highlight が hast の時点で済ませ、領域差し替えは React の再描画に変わったため）。

**設計との整合のため2点、既存コードに手を入れた。** (1) `test/architecture.test.ts` の
「ui/ の領域どうしの import」から `report` を外し共有部分にした（`main-view/` の `<Report>` が
`ui/report/` の `<Markdown>` を直接使う必要があり、design.md 6.1 の部品の木と両立させるため。
T-096 が `report` を領域として名指ししていたが main-view との依存を見落としていた）。
(2) `protocol/session-state.ts` の `mainViewEntries` が `tool` 系レコードを除外していたのを
復活させた（`toolUseId` 等の内部情報は落とす）。`docs/requirements.md`「メインビューはレポート
だけ」（2026-09-11）は文言のままだと `ToolRun` と矛盾するが、design.md 6.1 の部品の木と
タスクの完了条件（toolVisibility の3種のテスト）を優先し、requirements.md 4.2 に
「サイドバーは進行、メインビューはその依頼の記録」と役割の違いを追記した。

`bun run check`: 399 pass / 43 files → 320 pass / 42 files（3層併存の旧テストが大量に消え、
`protocol/main-view.test.ts` / `ui/report/markdown.test.tsx` / `ui/main-view/{main-view,report}.test.tsx`
などを追加）。**`bun test --isolate` に変更**（`package.json`。`mock.module` がプロセス全体に
効き、`report.test.tsx` のスタブ化した `Markdown` が他ファイルへ漏れたため）。

偽の駆動（7401番）+ Playwright: 台本に4つ目のターン（引用・2段ネスト・水平線・列揃え・
note/badge/cols/mermaid/chart の見本）を足し、blockquote・入れ子の `ul`・`hr`・
`style="text-align: center/right"`・`.note.note-warn`・`.badge.badge-ok`・`.cols > .card`・
`pre.mermaid` 内の `svg`・`.chart-block` 内の `canvas` がすべて実際に描かれることを確認。

**実機（本物の claude、7403番）でも3往復して確かめた。** レポートは 0.7 秒ごとの実測で
69 → 584 文字・塊 0 → 6 と 18 秒かけて流れ、**ターンが終わった瞬間に 584 → 573 文字へ整形し直された**
（`docs/requirements.md` 4.2「リアルタイムに流す」が実機で成立している）。同じ往復で引用・2段ネスト・
水平線・列揃え（中央4セル・右4セル）・note・badge・cols+card・mermaid の `svg`・chart の `canvas` が
描かれ、`img` と `script` は0件。2ターン目でタブが「今回」「1つ前」の2つ出て先頭へ戻り（`scrollTop` 0）、
失敗した `Bash` がツールの行として赤枠で出た。ブラウザのコンソールに出るエラーは `/favicon.ico` の
404 だけで、**これは移行前（HEAD）でも同じ**（段6が持ち込んだものではない）。

**受け入れ時に4点直した。** 推移的な依存 `hast-util-sanitize` からの型 import を `rehype-sanitize` の
`Options` に変更（足してよい依存は design.md 11章の一覧だけ）。`--isolate` の前提が古くなっていた
コメント2箇所（`test/dom-environment.ts` / `test/ui/main-view/report.test.tsx`）を実態に合わせ、
`core/report-notation.ts` の経緯のコメントを「規約と schema を揃える」という制約の記述に置き換えた。

**ユーザーの追認が要る点**: 上の (2) は 2026-09-11 の決定（「メインビューはレポートだけ」）の
読み替えにあたる。タスクの完了条件と design.md 6.1 がツールの行を求めているので進めたが、
決定そのものを戻したいなら `mainViewEntries` のフィルタと requirements.md 4.2 の該当箇所を戻せばよい。

### 2026-09-13 移行の段5（キャラビューを React の部品に）

**T-098 完了。** キャラビュー（立ち絵と吹き出し）を `src/ui/character-view/` の4部品
（`CharacterView` / `Portrait` / `BalloonTrack` / `Balloon`）にし、素材は HTML に埋めずに
`/character/<file>` から取る形にした。`core/character-pack.ts` が `character.json` を読んで
起動時に `character-changed` を1回流し、`SessionState.character` には **URL だけ**が乗る
（allowlist は `portraits` に書かれたファイル名のみ）。SVG は部品が `fetch` して
`dangerouslySetInnerHTML` でインラインにするので、差し色の `--outfit-accent` が効く。
表情の「作業中」への遅延切り替えは、サーバ（`event-sink.ts`）のタイマーから部品の
`useEffect` へ移した。旧の `/events/character`・`buildCharacterBody` / `portraitMarkup`・
`infrastructure/character-asset.ts` は削除。**残るはメインビューだけ（段6）。**
`bun run check` は 399 pass / 0 fail（393→399）。目視は偽の駆動 + CDP（1400x900）で
最新の吹き出し bottom 759.0、立ち絵の高さ 242.55px が段4と一致することを確認した。

**`/character/<file>` の置き場所は設計書と1点ずれている。** `docs/design.md` 5章は
`core/server.ts` に置くとしているが、HTTP の配信自体がまだ旧 `infrastructure/view-server.ts`
にあり、旧4層から `core` を import できない。allowlist とファイル読み取りだけを core に置き、
配信側には関数を注入する形にした（**段7で HTTP 配信ごと `core` へ移すときに解消する**）。

### 2026-09-13 移行の段4（入力欄を React の部品に）

**T-097 完了。** 入力欄（送信・中断・経過時間・`/` 補完・答え待ちの箱）を `src/ui/dispatch/` の
5つの部品にし、旧の `POST /api/prompt` / `/api/interrupt` / `/api/answer`、`GET /api/commands`、
`/events/turn-status` / `/events/pending-answer`、`browser/dispatch.ts` / `command-suggestions.ts` /
`pending-answer.ts`、`dispatchRegionHtml` 一式を消した。**残る2領域（メイン・キャラ）は旧のまま。**
経過時間は `SessionState.turnStartedAt` / `turnFinishedAt` から部品が計算する（1秒の刻みは部品の
ローカルなタイマーで、秒数は状態に持たない）。`protocol/tool-summary.ts` は段3 の申し送りどおり
`ui/component/tool-summary.ts` へ移した。`bun run check` は 393 pass / 0 fail（432→393。旧の HTML
文字列テストが消えた差し引き）。

**委譲した実装を2点差し戻した。** (1) `Answer.labels` を「質問が1件のときだけ意味が変わる」形
（選んだラベルをそのまま並べ、`core` 側で「、」結合）にしていたので、**契約どおり
`labels[i]` は `questions[i]` への答え1つ**に統一した（複数選択は部品の側で「、」につなぐ）。
件数でフィールドの意味が変わるのは型に表れない暗黙の契約になる。**タスク本文の完了条件(8)
「labels に2つ入る」はこの理由で満たしていない**（`evidence` に記録）。(2) `formatElapsed` が
テストのためだけに `export` されていたので外し、部品経由の検証に置き換えた。

**実機で1往復した**（SDK の駆動、`TSUKUMO_VIEW_PORT=7502`、Playwright で操作）: 送信 →「中断」に
変わる → 完了で「所要」、⌘Enter でも送れる、中断が効く、**許可モードを「毎回聞く」にして許可と
拒否の両方**、答え待ち中はタブのタイトルが「● 」で始まり答えると戻る、枠の強調（`.dispatch-pending-glow`）
が出て消える、`/` 補完10件と Tab 確定（送信しない）。偽の駆動（7503）で **multiSelect に2つ答え
`labels: ["A案、C案"]` が届く**のを確認。**7327 の常駐は元から止まっており、触っていない。**

### 2026-09-13 移行の段3（サイドバーを React の部品に）

**T-096 完了。** サイドバーの3区画（いま何をしているか・タスク一覧・セッション情報）を React の
部品にし、旧の `/events/sidebar`・`buildSidebarBody`・`POST /api/model` / `/api/permission-mode`・
`browser/session-info.ts` を消した。**他の3領域は旧のまま動いている。** タスク一覧は
`core/task-summary.ts` が mtime を見て `tasks-changed` イベントを起こす形に変わり、
`SessionState.tasks` に入る。**`ui/` の作法3点も同じ段で入れた**（`ui/component/` を切る・領域
どうしの import を禁じる辺・barrel file を作らない規約）。`bun run check` は 432 pass / 0 fail
（445→432。旧の HTML 文字列テストを消して部品のテスト30件を足した差し引き）。**見た目は据え置き**
（4つの幅で実測、段2 と同値）。

**`bunfig.toml` が増えた**（`test/dom-environment.ts` を preload して `@testing-library/react` が
要る DOM のグローバルだけを借りる。`fetch` / `WebSocket` / タイマーは差し替えないので、実際の
HTTP と WebSocket を使う既存のテストが巻き添えにならない）。

**`protocol/tool-summary.ts` は段4 で `ui/` へ移す**（旧の答え待ちの箱と新しいサイドバーの両方が
読むため一時的に `protocol` へ置いた。申し送りは T-097 の本文）。

### 2026-09-13 Playwright（playwright-core）の導入

**ユーザーの承認を得て `playwright-core` を devDependency に足した**（タスクIDなし）。
`docs/design.md` 10章が「偽の駆動で起こした tsukumo に Playwright」と名指ししていたのに
11章の依存の一覧から漏れていたので、そこも埋めた。**ブラウザは落とさない**
（`playwright` の側は postinstall で約130MB を取りに行く。`playwright-core` は driver だけ 13MB で、
`chromium.launch({ channel: "chrome" })` として手元の Google Chrome 153.0.8010.36 を動かす）。
**テストランナーは足していない**（`@playwright/test` ではなくライブラリだけ。`bun test` と競合しない）。
道具は `scripts/capture-view.ts` 1本で、URL を開いて画像に撮り、`--measure <selector>` で位置と
大きさを数値で出す。**`bun run check` には入れない**（生きたサーバが要って遅い）。
**偽の駆動（7398）で動作確認済み**: 1400x900 で撮れ、`.layout-main` 1006.8x505.44 /
`.layout-sidebar` 335.61x505.44 / `.layout-character` と `.layout-dispatch` が各 671.2x336.97 /
`.portrait` 高さ 242.55px（T-091 の記録 242.5px と一致）/ 横のはみ出し 0px。画像には4領域・立ち絵・
吹き出し・タスク一覧・入力欄が出ていた。`bun run check` は 445 pass / 0 fail。

### 2026-09-13 移行の段2（protocol と core の骨組み・WebSocket・偽の駆動）

**T-095 完了。** `src/protocol/`（両側で共有する語彙・畳み込み・zod）と `src/core/`（SDK 駆動・
セッション管理・WebSocket・偽の駆動・環境変数）を切り、`/ws?t=<起動トークン>` を1本通した。
**旧の SSE 5本と POST 6本はそのまま動いている**（見た目は変わらない）。着手前にユーザーと決めた
4点: **zod は境界だけ**（`ClientCommand` は全部、`ServerFrame` は封筒だけ。`SessionEvent` /
`SessionState` は TS の型のまま）、**起動トークンを入れる**、**`showView` はタブを貼り直す**、
**バッチ 100ms ＋ `ui.js` の空の入口まで**。`domain/` は消えて `protocol/` に吸収され、
`session-driver` / `host` / `orca-host` は `core/` へ移った（`REPORT_NOTATION_PROMPT` は
`systemPromptAppend` として `index.ts` から注入する形にした）。**`orca tab goto` は存在しない**
ことが実測で分かり（正しくは `orca goto --url --page`）、`docs/requirements.md` 5章の表を直した。
`bun run check` は 445 pass / 0 fail（415→445）。**実機で確認済み**（偽の駆動でタブの貼り直し、
SDK の駆動で1往復。詳細は `evidence`）。

### 2026-09-13 描く層をブラウザ側へ移す決定と、正典の書き換え（移行の段1）

**ユーザーの依頼「最適なアーキテクチャを再考して提案して。規約にとらわれず、言語やエコシステムから
見直してもいい」に対して、`src/` 全体と正典を読んで `docs/research/architecture-rethink.md`（経緯・
症状・採らなかった案・判断の基準）を書き、ユーザーの訂正2件（立ち絵は動くが**話さない**。端末ペインは
用途が無いので**余地も残さない**）を反映したうえで、「移行しようか」の決定を受けて
`docs/design.md`（設計書。正典）を新設した。** 中身は `protocol` / `core` / `ui` の3層、WebSocket 1本の
プロトコル（`hello` / `events` / `error` と `ClientCommand`）、両側で共有する reducer、React の部品、
unified の Markdown、キャラクターパック（`persona.md`）、偽の駆動、起動トークン、段2〜段9 の完了条件。
言語（TypeScript）とランタイム（当面 Bun）は変えない。

**正典を移行後の形に合わせた**: `docs/architecture.md`（現在の実装状況に移行中の注記、設計判断に
「描く層をブラウザ側へ移す」を追加、SSE / フレームワーク不採用 / 4層の3節に「役目を終える」注記）、
`docs/requirements.md`（2.2 の PTY と音声、4.2 の Markdown ライブラリを覆した注記と配り方、4.3、4.4、
5章の依存の承認、7章の未決事項3件。`^#{2,3}` の節の数は 26 のまま）、`docs/coding-standards.md`
（「層と依存の向き」を3層に書き換え、旧4層との併存の規則、会話内容にブラウザ側のメモリの1文）、
`docs/glossary.md`（「通信（移行後）」の節に5語）、`CLAUDE.md`（現在の状態・原則2・関連リンク）。
**`develop/direction.md` に段2〜段9 をタスク化する指示を書いた**（次のセッションが `/plan-tasks` で
起こす。T-088 は閉じる、T-063 は段6に吸収、T-064 / T-065 は段8に統合、T-078 は段9）。
コードは1行も変えていない。`bun run check` は通る（件数は下の「次にやること」の直前に記録）。

### 2026-09-13 キャラビューの立ち絵と吹き出しの位置

**T-091 完了。** 立ち絵を大きくし（`--portrait-height` 68%→78%）、最新の吹き出しの位置を
**セリフの件数によらず固定**した。`.balloon-track` を下端揃えのまま `--balloon-bottom-gap`
（7rem）ぶん浮かせ、`max-height` も同じだけ差し引く形。**一度 `align-self: center` で
「箱ごと中央寄せ」にしたが差し戻した**（箱の高さがセリフ件数で伸びるので、箱の中心を固定すると
下端＝最新が下へズレていく。2026-09-12 の「下半分を空ける」案の差し戻しとは別の失敗）。
**尻尾は下辺から左下へ出す形をやめ、左辺から真横（左）へ**（ユーザーの指示）。
`.balloon-track` は `overflow-y: auto` を持つと横方向もクリップされるので、
`padding-left: var(--balloon-tail)` で尻尾の場所を内側に確保している。立ち絵と吹き出しは
最後に揃えて 1.5rem ずつ下げた（`--portrait-drop` 0.75rem→2.25rem）。
**数値は CDP で実測**（1400x900、セリフは合成）: 最新の rect が 1/3/8 件とも top 680.45 /
bottom 735.0 で不動、並びに使える高さは変更前後で同じ、立ち絵は 211.5→242.5px。
**実機の目視も実施**（Orca のタブ、127.0.0.1:7327）でユーザーの了解を得た。
`bun run check` は 415 pass / 0 fail。

**T-062 完了（決めるタスク。実装はしない）。** レポートを読む時間を減らすために**どの層に足すかを
決めた**。3層を実物で棚卸しした結果、**語彙はすでに足りていて、足りないのは「どう描くか」の指示**
だと分かった（ユーザーの言葉「重要なのは output styles のほうなのかもしれない」）。決定は
`docs/requirements.md` 4.2「読む時間を減らすために足すのは、規約の側」に記録し、**見せ方と再構成の
線引き**（本文の文字列を変えないものが見せ方／レンダラが目次・要約・段組みを起こすのは再構成で
やらない／書き手が最初からその構造で書くのは執筆）も一緒に書いた。後続3件の案は
`develop/direction.md` へ（規約の印の語彙・列揃え `:---:`・`dl` の CSS）。
着手前に `develop/progress.md` の `### 2026-09-12` の1小節（290行）を
`docs/history/progress-archive.md` へ移した（`tasks.json` 側はトリガー未該当）。

**T-090 は着手せずに閉じた**（ユーザーの判断「やらなくていいや」。2026-09-13）。`passes` は
`false` のまま `done` にしてある（未達で終了の形）。セリフ0件のプレースホルダは
`<div class="balloon">` のままなので、気が変わったら新しいタスクとして起こす。

## 次にやること

**移行（`docs/design.md`）の段2〜段9をタスク化した（2026-09-13 `/plan-tasks`）。** 直列の依存で、
**着手できるのは T-095（段2）だけ**。`loopable` は T-096 / T-098 だけ `Y`（CDP の数値比較で受け入れ
られる）で、他は実機の確認かユーザーの判断が要る `N`。

| 段  | タスク                                                   | difficulty | loopable | 依存         |
| --- | -------------------------------------------------------- | ---------- | -------- | ------------ |
| 2   | T-095 protocol と core の骨組み・WebSocket・偽の駆動     | opus       | N        | —            |
| 3   | T-096 サイドバー                                         | sonnet     | Y        | T-095        |
| 4   | T-097 入力欄                                             | sonnet     | N        | T-096        |
| 5   | T-098 キャラビュー                                       | sonnet     | Y        | T-097        |
| 6   | T-099 メインビューと unified の Markdown（T-063 吸収）   | sonnet     | N        | T-098        |
| 7   | T-100 旧4層の後始末                                      | sonnet     | N        | T-099        |
| 8   | T-101 キャラクターパックと切り替え（T-064 / T-065 統合） | opus       | N        | T-100        |
| 9   | T-078 セッションの復元                                   | opus       | N        | T-077, T-100 |

**2026-09-13 に T-096 と T-100 の本文へ追記した**（bulletproof-react の現物と突き合わせた結果）。
T-096 に **`ui/` の作法3点**（`src/ui/component/` を切る・領域どうしの import を禁じる辺を
`architecture.test.ts` に足す・barrel file を作らない規約）を、T-100 に **枠組みの説明の書き直し**
（`CLAUDE.md` 原則2 の「受け取る／決める／描く」と `docs/design.md` 2章を、共有コントラクト＋
クライアント/サーバ分割の語彙に直す）を足した。**`features/` への改名はしない**（領域の名前は
`docs/glossary.md` が正典）。ポートとアダプタ（`core/host.ts`）は2つ目の実装を見込んでいるので残す。

**閉じたタスク**: T-088（着手せず）、T-063 / T-064 / T-065（統合）。`done` 10件は
`docs/history/tasks-archive.md` へ移した（`tasks.json` は 126,849 → 72,374 バイト）。
**段2以降、新しいコードは `src/protocol/` / `src/core/` / `src/ui/` に置く**（旧4層は段7まで併存）。

**移行と独立に残っているもの**: T-046（箱）、T-076（待ち時間の表示）、T-093（規約の「印」）、
T-094（`dl` の CSS。T-093 待ち）。

**2026-09-13 に届いた指示「`frontend-design` のスキルでデザインを再考しよう」を T-102 / T-103 に
起こした。** T-102（opus・着手可・`/loop` に載せない）は**計画までで止める決めるタスク**で、
Color / Type / Layout / Principles のトークンを `docs/design.md` に書く。いまの CSS は
**17色が 114 箇所にハードコード**されていて色と書体のカスタムプロパティが無い、という現状を
本文に控えてある。T-103（sonnet・T-102 と T-100 待ち・`/loop` に載せない）が適用で、
**依存に T-100 を入れたのは段5（T-098）の完了条件が「見た目が変わっていないこと」だから**
（移行中に見た目を変えるとバグと意図した変更が区別できない）。前倒しの可否は T-102 の論点。

**`develop/tasks.json` の `done` 9件は `docs/history/tasks-archive.md` へアーカイブした**
（2026-09-12、サイズのトリガー 31801/30720B に達したため。`tasks.json` は 106535 → 50183 バイト）。
`progress.md` は最新の日付の小節しか無いので移していない。

**2026-09-13 に使ってみて出た直し3件（T-090 / T-091 / T-092）を登録した。** T-090 と T-092 は
機械で測れるので `/loop` に載る。T-091（吹き出しを中央寄りに＋立ち絵を大きく）は**見た目の
可否をユーザーが決める**ので載せない。

**2026-09-13 に T-062 の決定から後続3件を登録した。** T-093（規約の「印」の語彙。opus・
ユーザーの目視が要るので `/loop` に載せない）、T-094（`dl` の CSS。sonnet・T-093 待ち・
`/loop` に載る）。指示の3件目だったテーブルの列揃え `:---:` は**新規に作らず T-063 に統合**し、
ついでに T-063 の移動前のパスと「迂回を外す先」（`asuna.md` → `report-notation.ts`）を直した。

**`/loop` に載るタスクは尽きた**（2026-09-12 に T-085 / T-086 / T-089 まで完了）。
残っているのはすべて `loopable: "N"` で、ユーザーの判断・グローバル設定の書き換え・実機の確認の
いずれかが要る。

**T-080 の3段階はタスク化済み**（T-086 / T-087 / T-088。指示メモは
`docs/history/direction.md` の 2026-09-12 の節へ移した）。**着手できるのは T-086 から**で、
これは `/loop` に載せてよい唯一のアーキ系タスク（claude を起こさず、`bun run check` と
`bun build` だけで受け入れられる）。

**2026-09-11 に方針を全面的に見直した。** 順番は「スパイク → 縦1本 → 横に広げる → Electron の判断」。
縦1本（T-037〜T-040）と横に広げる分（T-043 / T-044 / T-045 / T-049）は完了。

- **`/` 補完の3件（T-050〜T-052）と吹き出しの分割（T-053）は完了。** 目視はユーザーが後で行い、
  `evidence` に追記する（T-043〜T-045 と同じ扱い）
- **サイドバーの改善3件（T-054〜T-056）は完了。** 目視は同上
- **目視がまとめて未実施**: T-050〜T-056 と T-061 の8件（T-072 の実機確認もここに加わる）。tsukumo を起こし直して（出力スタイルも読み直される）
  Orca のタブで確かめ、各タスクの `evidence` に1行ずつ追記する。**T-061 の目視は先に一部が済んだ**:
  合成データのページを描いたところ「セッション情報」の中身が高さ0に潰れており、回帰として T-067 に起こして直した
- **T-046（opus、着手可能）**: 箱の判断。ユーザーの感想が要る。依存（T-042 / T-057）は完了し、
  比較表 `docs/research/app-shell.md` も揃っている
- **T-058（opus、着手可能）**: tsukumo 以外の素の TUI でレポートに HTML タグが出る件。出力スタイルを
  分けるか / 1ファイルで条件分岐するか / tsukumo が `systemPrompt` で足すかを決める。ユーザーの選択と
  グローバル設定を触る承認が要る
- **T-062（opus、着手可能）**: レポートを読み終えるまでの時間を短くするために、レンダラ・CSS・
  出力スタイルの3層のどこに何を足すかを決める。ユーザーの感想が要る。実装はしない
- **T-063（sonnet、T-062 待ち）**: 自前レンダラで描けない引用・ネストしたリスト・水平線を埋める
- **T-064（opus、T-058 待ち）**: キャラクターの切り替え。人格（出力スタイル）と素材
  （`characters/` 配下）を1人の単位にどう束ねるか、起動時だけか途中で切り替えるかを決める。
  人格の正典の置き場所は T-058 が決めるので、その後に回す。ユーザーの選択が要る
- **T-065（sonnet、T-064 待ち）**: 決めた方式で切り替えを実装する

2026-09-12 に届いた指示から起こした10件（**登録しただけで未着手**）:

- **T-076（opus、着手可能）**: 待っている間にメインビューへ何を出すかを決める。
  ユーザーの体感が正典。実装はしない
- **T-077（opus、着手可能）**: セッション復元の方式を決める。**会話内容の複製にあたるかが
  最大の論点**（規約を曲げるなら規約側を先に直す）。実装はしない
- **T-078（sonnet、T-077 待ち）**: 決めた方式でセッション復元を実装する
- **T-087（sonnet、T-086 待ち）**: `index.ts` からユースケースを抜いて配線だけにする
- **T-088（opus、T-086 / T-084 / T-085 待ち）**: `presentation/view.ts` の割り方を決めて割る

T-046 / T-064 / T-076 / T-077 はいずれもユーザーがいる
セッションで（委譲せず、`/loop` に載せない）。

## 未解決

- **キャラビューの中の配置は T-071 で決着**（立ち絵は下端に接して床に立ち、並びは下端起点で
  最新が一番下・過去は上へ押し上がる、最新だけ強調）。残っているのは**実機での目視**と、領域
  そのものの大きさ・位置（いまは下段左・高さ 40%×幅 50%）を変えるかどうか
- 積み残しの候補（タスク化していない）: 入力履歴（上キー）、`/loop` 代替の繰り返しトグル、
  ビューの認証、メインビューの差分更新、立ち絵と吹き出しを別々に差し替える

## 注意

次のセッションで踏み外しやすい点:

- **`develop/tasks.json` を書き換えたら `bun run format` を通す。** oxfmt は JSON も整形するので、
  python の `json.dump` で書いたままだと `bun run check` が落ちる（2026-09-13 に踏んだ）
- **描画の確認は `bun run scripts/capture-view.ts <URL> --measure <selector>`**（2026-09-13 導入）。
  偽の駆動（`TSUKUMO_DRIVER=fake`）と組み合わせると claude を起こさずに撮れる。**撮った画像を
  リポジトリに置かない**（既定の出力先は `/tmp`。ビューには会話の内容が写る）
- **2026-09-13 に描く層をブラウザ側へ移すと決めた。正典は `docs/design.md`。コードはまだ移行前の形。**
  `docs/architecture.md` の「採用アーキテクチャ」「新しいコードを置く場所」は移行前の記述で、段7で
  書き換える。**移行前の形に機能を足さない**（足すなら新の層へ）
- **正典ドキュメントは新方針に書き換え済み**（T-035）。設計判断の旧節は「役目を終えた」の
  注記付きで残っている。経緯を辿るときだけ読む
- **旧方針のコードは撤去済み**（T-042）。`src/transcript.ts` / `src/state.ts` /
  `src/transcript-target.ts` / `src/subagents.ts` / `hooks/` は無い。`src/transcript.ts` の
  残った部分（`splitUtterance`）は `src/utterance.ts` に、`MainViewEntry` は
  `src/session-view.ts` に移した
- **`~/.tsukumo/`（`state.json` / `targets/` / `transcript-path`）はもう読まれない**が、
  消していない（利用者のホームの掃除は利用者がする）。消して構わない
- **`bun run start` は本物の claude を子プロセスで起こす**（API の利用が発生する）。テストから
  CLI を起動しきらない。動作確認は `TSUKUMO_VIEW_PORT` を変えて起こし、終わったら
  `pgrep -f claude-agent-sdk` で子プロセスが残っていないことを確かめる
- **7327 番の常駐は 2026-09-12 時点で止まっている**（T-070 の確認中に気づいた。`lsof -iTCP:7327` も `pgrep -f claude-agent-sdk` も空。いつ止まったかは不明）。**動いているかは前提にせず、その場で確かめる。**
- 以前の記録: **7327 番で tsukumo が動いている**（2026-09-12 実測。新方針のコードで、`claude-agent-sdk` の
  子プロセスを持つ）。起こし直すときは先に止める。**動作確認で別のを起こすときは
  `TSUKUMO_VIEW_PORT` を変え、止めるときは自分が起こした pid だけを落とす**
  （`pgrep -f claude-agent-sdk` は常駐の分も拾うので、空になることを完了条件にしない）
- **`tsukumo` は `bun link` でグローバルに入っている**（`~/.bun/bin/tsukumo` →
  リポジトリの `bin/tsukumo`）。消すときはリポジトリ直下で `bun unlink`
- **`git stash` に PTY 路線の未コミット分がある**（stash@{0}）。戻す予定は無い。誤って
  `git stash pop` しない
- **`~/.claude/settings.json` の hooks と statusLine は orca（`~/.orca/agent-hooks/`）が
  専有している。** tsukumo のエントリ5件は 2026-09-12 に外した（残る12件はすべて orca のもの）。
  **設定を足す・外すときは既存エントリを壊さない。** 上書きすると orca が黙って動かなくなる
- **出力スタイル（`~/.claude/output-styles/asuna.md`）はセッション起動時にしか読まれない。**
  `/clear` では読み直されない（2026-09-10 実測）
- **transcript も SDK のイベントもユーザーの生の会話。** 複製しない・外部に送らない・全文を
  ログに出さない・テストのフィクスチャに実物を使わない（`docs/coding-standards.md`
  「会話内容の扱い」）
- **CLI を起動するテストは、負荷が高いとフレークする。** `bun run check` は他の重い処理と同時に
  走らせない（2026-09-09 に1件が457秒かかった）
- **`oxfmt` は Markdown も整形する。** `docs/` と `develop/` は対象、`.claude/` と `vendor/` は除外
- **環境の実測値は1日で変わる。** `docs/requirements.md`「5. 実行環境・非機能要件」の値も
  **前提にする前にその場で確認する**（2026-09-11: Claude Code 2.1.268、SDK 0.3.268）
- **`develop/tasks.json` に無いタスクIDはアーカイブ済み**とみなす
  （2026-09-12 に done 12件、同日さらに 10件、同日さらに 7件、同日さらに 9件を移した。計 70 節）。中身は
  `docs/history/tasks-archive.md` の `## T-XXX` の節

**T-092 完了。** サイドバーの「セッション情報」で、ラベルと `<select>` が行ごとにズレていたのを
揃えた。原因は**行ごとに別々の flex**（`.model-select-wrap` / `.permission-mode`）で並べていたこと
で、ラベルの文字数の差（「モデル」3字 /「許可モード」5字）がそのまま `<select>` の左端の差
（26.36px）になっていた。`.session-info` を `display: grid` の2列
（`auto minmax(0, 1fr)`）にし、`modelSelectHtml` / `permissionModeHtml` は**ラベルと値を別々に
返す**形へ変えて、4つをグリッドの直接の子として並べている（1行を div でくるむとその div が
1マスになり、列が揃わない）。**CDP 実測**（headless Chrome、合成データ）で
1400/900/759/600/400/320px の全幅で select・label とも差 0px、`scrollWidth == clientWidth`。
`label[for]` → `<select>` のフォーカスも維持。**委譲した実装が文字サイズを変えてしまっていた**
（`.session-info-value` に `font-size`/`color` が無く、`font: inherit` の `<select>` が
`.sidebar-block` の 0.85rem を拾って 12.8px→13.6px、状態表示の色も #8f97ab→#e6e8ee）ので、
両方を `.session-info` に置いて HEAD と同値に戻した。`bun run check` は 415 pass / 0 fail。
**実機の目視は未実施**（CSS は起動時に束ねるので、7327 の常駐プロセスを再起動しないと反映されない）。

**T-077 完了（決めるタスク。実装はしない）。** 起こし直したときのセッション復元の方式を決めた。
**最大の論点だった「会話内容の複製にあたるか」は、複製せずに済むことが分かった**: claude 自身が
`~/.claude/projects/` に transcript を書いている（SDK の `persistSession`、既定 `true`）ので、
tsukumo は**そこを正典として読み直すだけ**でよく、自前のキャッシュもスナップショットも要らない。
規約は曲げず、`docs/coding-standards.md`「別の場所に複製しない」に「禁じているのは書き出すほう」
という1文を補うだけにした。ユーザーの選択は **(1) 会話＋画面の履歴も戻す、(2) 常に自動で続きから、
(3) 鍵は `cwd` ＋ tsukumo が `tagSession` で付けた印**。(3) は `tsukumo` が `bun link` で
グローバルに入っていて同じディレクトリで素の `claude` も使いうるため、`cwd` だけでは足りない。
(2) の事故（意図せず前の文脈が続く）には「続きから始まったことの表示」と「新規で起こす逃げ道」を
セットで要求に入れた。決定は `docs/requirements.md` 4.8「セッションの復元」。
**SDK の口は型定義で裏取り済み**（`Options.resume` / `listSessions` / `tagSession` /
`getSessionMessages`）。`SessionMessage` が `toSessionEvents` の見ている形とほぼ同じで**そのまま
流し込める**ことも確認したので、T-078 の本文に足りない2点（利用者の依頼をテキストブロックから
起こす・`result` が残らないのでターンの境目を依頼で区切る）まで書き下し、`difficulty` を
sonnet → opus に上げた。`bun run check` は 415 pass / 0 fail（コードは未変更）。
