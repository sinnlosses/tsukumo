# テスト: 手で確かめること（撮り方と待ち）

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: 手で確かめることの前半。目視が要る理由と `evidence`、fake driver で起こすこと、押せる要素の走査、状態のカタログ、撮る前の待ち、`capture-view.ts` の `--wait-for`・`--reveal-at`・`--stub-rpc`・`--scroll-to`。
読む時: 描画を変えて画を撮る・撮る前の待ちを直すとき。
直す時: 撮影の道具の待ち方・撮り方を変えたとき。

## 手で確かめること

**見た目（色・崩れ・間合い）は自動チェックで捉えられない。** 単体テストで守るのは「受け取る」
「決める」と配信そのもの（バインド先・経路・push）と出し分け・DOM の細部、**E2E で守るのは利用者に見える流れと実ブラウザでしか確かめられないもの**
（上の「E2E の走らせ方」。`pnpm run check` の最後の段の `pnpm run test:e2e`）
まで。E2E のスクリーンショットは落ちた回と `E2E_UPDATE=1` の回だけ `/tmp/tsukumo-e2e/` に出て判定には使わないので、表示に関わる変更をしたら、
次を確認してその結果を `evidence` に書く（`~/.claude/skills/task-model/WORKFLOW.md`
「結果の書き方と知見の置き場」と `docs/workflow.md`「タスクを書くとき・受け入れるとき」）。

**fake driver（`TSUKUMO_DRIVER=fake`）で起こせる**ので、claude を起こさず（API を使わず）に
下の手順を回せる（上の「テスト」）。

押せる要素（`button`・リンク・クリックの的）を足す・変えたら、撮影の前に `pnpm run test:e2e test/e2e/target-size.test.ts` を単独で流す（下限の中身は「E2E のシナリオの一覧」の表の「会話の画面の押す的と字」の行を見る）。

**状態ごとの画面を並べて見るときは `node scripts/capture/capture-catalog.ts`。** 疑似セッションの場面
（`fixture/fake-session/index.json` の `turns` の名前）ごとに tsukumo を1件ずつ空きポートで起こし、
広い窓（1400x900）と狭い窓（720x900・縦に積み替わるのでページ全体）で撮る。**同じ場面を別の
操作で何枚も撮る件があるので、名指しは場面の名前ではなく件の名前**（`--only notation-figure`
のように。`--only` に使える名前の一覧は `--help` で出る。**オプション無しで実行すると
カタログ全件を広い窓・狭い窓の2枚ずつ撮ってしまい、60秒では終わらないので踏まない**）。
狭い窓に撮るものが無い件（質問の preview の画像）は広い窓の1枚だけ（`catalog-entry.ts` の `sizesOf`）。
**件によっては撮る前に操作を当ててから撮る**（領域の内側を送る・ボタンを押す・
入力欄に打つ・`location.hash` を書く、など） — 疑似セッションを流しただけでは出ない
状態（記法の見本の下側・タスク一覧のモーダル・`/`と`@`の補完・キャラクター画面）をこれで出している。
`/tmp/tsukumo-catalog/index.html` に並べる（`--out` で置き場を変えられる）。**依頼を手で送らなくても狙った状態が出る**ので、
お伺いの札・レポートの記法を直したら前後で撮り比べる。1枚だけ撮って要素の位置と大きさを
数値で読むのは `capture-view.ts`（class セレクタで測るときは `[class*="…"]` — CSS Modules が
`名前_ハッシュ` に焼くため）。**`scripts/capture/lib/` の `catalog-*.ts`（`capture-catalog.ts` の件の定義。件は概念ごとのファイルに置き、`catalog-entry.ts` が組み立てる）が待つ `[class*="名前_"]` の名前が CSS Modules に
定義されているかは `test/scripts/capture/capture-catalog-selector.test.ts` が確かめる**（件そのものは
`pnpm run check` で走らない）。区画の格子と札（`cols`・`card`・`badge`）の見え方は、場面 `report-board` を
`capture-view.ts --scene` で撮って見る。**撮影の道具（`capture-view.ts`・`capture-catalog.ts`）は、`dist/browser/` が古い・読めないと tsukumo を起こさず、`pnpm run build` を促して非0で止まる。**
**撮った画像はリポジトリに置かない。** 疑似セッションの会話は架空でも、
**タスク一覧のモーダルを撮る件には実データのタスク一覧（Beads の課題）が写る**ので、
画像そのものを他所へ共有・複製しない。

**検証結果の表（`report-checks`）とレポートの記法の「流れ」（`notation-flow`）も
`capture-catalog.ts` の件にある。** 書き上げていくように見せる演出中の要素は `clip-path` で
隠すだけで DOM には残る（`useReportReveal`）ので、疑似セッションが場面の最後まで流れ切って
狙った要素が現れるのを待ってから、演出を打ち切って（`skipReveal`）書き上がった状態を撮る。
`report-checks` は2件目の `report` が届く約7秒後まで検証結果の表が現れないので、
`CatalogEntry` の `settle` がその出現まで個別に待つ。**`settle` の `selector` は上限まで
現れなければ画像を書かず、非0で終わる**（読み込み中の画を黙って撮らない）。

**撮る前の待ちは、時間ではなく印で決まる。** 場面の終わりは、画面の WebSocket が受けた `events`
フレームに場面の最後の手の `kind` が届くまで待つ（`scripts/capture/lib/scene-end.ts`。上限は最後の手の
`afterMs` に猶予を足して導く）。場面の途中を撮る件は、`settle` を `scene-event`（その `kind` の何件目まで）で
指す。操作を当てる前と撮る前には、フォント・画像・終わりのある動きの完了を待ったあと、メインビュー
（`[data-region="main"]`。立ち絵は含めない）の見た目が連続2回の撮影で一致するまで待つ
（`settlePage`。比べる撮影は `animations: "disabled"` で、回る輪のような終わりのない動きだけを
比べから外す）。途中の手を待つ件（`scene-event`）は、窓ごとに場面を起こし直して同じ手を待つ。印が上限まで立たなければ、
件の名前と窓の名前を添えて失敗で終わる（途中の画を黙って撮らない）。場面を足す段には、その場面を引くカタログの札（`scripts/capture/lib/` の `catalog-*.ts` の `scene`）も同じ段に入れる。答え待ちで終わらない場面の札は `settle` を `phase: "before-prepare"` の `selector` にする（`after-prepare` は操作の前に場面の終わりを待つので、上限で落ちる）。

**要素が出るまで待ってから1枚だけ撮るときは `capture-view.ts --wait-for <selector>`。**
`capture-catalog.ts` と同じ理由（演出中の要素は現れているだけで書き上がっていない）で、
指定した要素が出たあと `useReportReveal` の演出が終わる（`data-revealing` が消える）のも
合わせて待つ。演出は打ち切らず、`capture-view.ts` が開いたページの時計
（`page.clock.install` で差し替える）を `runFor` で進めて終わらせるので、節が多い長いレポートでも
演出の長さで上限に当たらない。要素の出現は実時間で待ち、そのあとの演出の終わりも合わせて上限
（15秒）を超えたら screenshot を撮らずに失敗で終わる（黙って空の画面を撮らない）。

**書き上げる途中の画は `capture-view.ts --scene <場面> --reveal-at <ms>`。** 場面の演出が始まった
（`data-revealing` が現れた）瞬間にブラウザの時計を止め、そこから `<ms>` だけ進めた時点で、
`settlePage` を挟まずに撮る（`--wait-for` と `--advance` などの操作とは併用できない。`--scene` と一緒にだけ使う）。
**撮った直後に、本文の領域で書いている要素ごとの `clip-path`（隠れている・途中の polygon）と
`opacity` を表で出す**ので、自前のプローブを書かずに、画に写った範囲を値でも読める。
表の1行目の「演出の開始から Nms」は実測で、指定との差は数十ms。
**節が短いレポート（描いた文字数と図の重みの合計が約200未満）の場面は演出が始まらず、`--reveal-at` は
`[data-revealing]` を15秒待って失敗する**（`work-plan-parallel` など）。掛かるかは先に `--list-scenes` の
「演出: 掛かる見込み」「掛からない見込み」で引く。ただし見込みは節の重みしか見ず、草稿（下の節）を見ないので、見込みがあっても始まらない場面がある。

**書き上げる演出を実ブラウザで前後比較する手順。**

- 比べる前後で、同じ場面・同じ `--reveal-at` を使う（例: `--scene a2ui-reveal-sample --reveal-at 1000` と `--reveal-at 3000`）。書き途中の要素の数・`clip-path`・横のはみ出し（0px）が前後で並ぶ。
- `a2ui-reveal-sample` は、Note の warn・ng と Options の `adopt` を含む `components` の `report` の場面。`turn-finished` を `report` より先に置いてあり、これで草稿にならず演出が掛かる。
- E2E の文脈（`test/e2e/scenario-open.ts` の `reducedMotion: "reduce"`）では演出が走らない。演出の前後比較を E2E に頼まず、単体の `planReveal` に新旧の DOM を通して比べて代えた回がある。実ブラウザで比べるときはこの場面を使う。
- `[data-revealing]` が付かず `--reveal-at` が15秒待って失敗するときの原因は、草稿であることが多い。ターンが開いているあいだに届いた `report` は草稿として描かれ、そのツール呼び出しが記憶されて、確定版には演出が掛からない（`report`・`tool-finished`・`turn-finished` を同じ時刻に置いても同じ）。`prefers-reduced-motion` や偽の時計が原因ではない（この道具のブラウザは動きを減らす設定を持たない）。
- 疑似セッションで始まらないときは、`turn-finished` を `report` より先に置く（ターンが閉じたあとに届く `report` は草稿にならない）。

**疑似セッションが返さない手続きの応答の状態（プラン使用量の「該当しない」・取れない）は
`capture-view.ts --stub-rpc '<手続き>[@<範囲>]=<JSON>'`で撮る。** 手続きは契約の名前をドットでつないだもの
（`planUsage.report`）、JSON は出力そのもの、範囲は呼び出しの何回目かを1から数えて `3` か `1-2`（省くと全部。
外の呼び出しはサーバへ通す）。例: `--scene report-blocks --stub-rpc 'planUsage.report={"kind":"not-applicable"}'`。

**読み込み中の骨組み（一瞬で過ぎて撮れないもの）は、保留を明示して撮る。** `--hold-rpc <手続き>` は手続きの応答を返さず（`contextUsage.report` の `aria-busy="true"` の骨組み）、
`--hold-stream` はセッションの購読（`/ws`）のサーバからのフレームを捨てる（タスク一覧の `role="status"` の `TaskSkeleton`。`--cwd` に `.tsukumo/fake-beads-issues.json` のある場所を渡すと、保留を外せば一覧が出る比較ができる）。
保留は撮影が終わると破棄する。保留の指定が無いときの `--wait-for` は従来どおり、現れなければ画を書かず失敗で終わる。
例: `--scene report-board --hold-rpc contextUsage.report --wait-for '[aria-busy="true"]'`。

**メインビューの下のほうにある塊（ファイルの塊など）を窓の大きさで撮るときは
`capture-view.ts --scroll-to <selector>`。** `--wait-for` の待ちが済んだあと、指した要素を
メインビューのスクロールの容れ物の上端へ送ってから撮る。要素が無ければ撮らずに失敗で終わる。
**本文の末尾に近い塊（その後ろの本文が窓の高さに満たないもの）も上端へ届くよう、転がす前に撮影のページだけ
メインビューの末尾へ窓の高さ分の余白を足す**（本番の CSS は変えない。`--scroll-to` を使わない撮影には入らず、
使うときの `--measure` の `scrollHeight` は余白を含む）。
**2つ以上の要素に当たるとき（コンマ区切りのセレクタなど）は、文書の順で先頭へ転がし、
「一致 n 個、先頭へ転がした」の行を標準出力に出す**（失敗にはしない）。狙った位置と違うときはセレクタを絞る。
**転がしたあと、偽の時計（`--wait-for`・`--advance`・`--clock` で入る）があれば 500ms 進めて、描き直しが落ち着くまで待ってから撮る**
ので、転がしに連動する表示（やり取りの列の現在地の印など）は更新後の画になり、`--advance` を後ろに足さなくてよい。
`--reveal-at` は時計を止めて撮る道具なので、この待ちは掛けない（`--scroll-to` と併せて打つと、待たずに転がした直後の画が撮れる）。
