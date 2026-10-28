# テスト: 手で確かめること（手を動かす状態と部品）

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: 手で確かめることの中ほど。手を動かさないと出ない状態の撮り方（`--type`・`--click`・`--press`・`--hash`・`--cwd`・偽の `tw`・切り替え画面）、時計を進める・決める撮り方、`--scene` で1件だけ撮る・場面の途中を撮る、場面の一覧。
読む時: 操作を当てて画を撮る・場面を選ぶとき。
直す時: `capture-view.ts` の操作の口・場面の撮り方を変えたとき。

## 手で確かめること

**入力欄に打つ・押すなど、手を動かさないと出ない状態を撮るときは、`capture-view.ts` に
`--type <selector> <文字>`・`--click <selector>`・`--hover <selector>`・`--hash <hash>`・`--press <キー名>`・`--wait-after <selector>` を並べる。**
書いた順に、`--wait-for` の待ちのあと・`--scroll-to` の前に当てる（`--scroll-to` は書く位置を問わず最後）。1つでも当たらなければ
撮らずに失敗で終わる（撮影のカタログの `prepare` は当たらない手を飛ばして撮る）。
**`--press` のキーはフォーカスの置き場所へ届く。** 開いた直後のフォーカスは依頼の入力欄にあり、PageDown などメインビューで効くキーは届かない
（黙って空振りして、撮った画は変わらない）。置き場所がメインビューの中でもモーダルの中でもないときは、
「フォーカスがメインビューに無い（textarea など、置き場所）」の行を標準出力に出す（失敗にはしない）。先に `--click '[data-region="main"] h4'` のようにメインビューの中を押してから `--press` を書く。
語彙と当て方は `scripts/capture/lib/capture-preparation.ts` で共有している。
**`--hash` で開いた画面は読み込みを待たずに撮ると「…」の画になるので、読み終わってからだけ現れる要素を
`--wait-after` で待つ**（成果の画面は `--hash '#achievement' --wait-after 'section[aria-label="小さな驚き"]'`。
`bd` の読みで15秒ほどかかる）。`--wait-for` は先頭の1回だけで、準備の手のあとの待ちは `--wait-after`。
**起動先（`.beads` の有無・課題ファイル）で出し分ける画は `--scene <場面> --cwd <dir>` で、スクラッチに作った
ディレクトリを起動先にして撮る**（既定はこの作業ツリー。ただし手元の画像を置く場面〔`report-image`・`report-before-after`・`question-preview-image`〕は、`--out` の隣に架空の PNG を置いた作業場所を立てて起こす。件が `skipReveal` の場面〔`question-preview-image` 以外〕は、`--cwd` の有無に関わらず書き上げの演出を打ち切ってから撮る。`--cwd` は `--scene` と一緒にだけ使い、渡せば作業場所はそちらが優先）。
タスクの一覧・詳細を撮るときは、作業ツリーの根の `.tsukumo/fake-beads-issues.json` に架空の課題を `bd list --json` の形の配列で置く（撮ったら消す。実データを写さないため）。一覧を開いて行を押すには `capture-view.ts --scene report --click 'button:has-text("一覧を見る")' --click '[role="option"]:has-text("架空の文字")'` の形で当たる（`li:has-text(…)` は当たらない）。狭い窓（720px）では、先に引き出しを開いて（`button[aria-label="やり取りとタスクを開く"]`）タスクのタブ（`[role="tab"]:has-text("タスク")`。話題モードでは「話題」）を押す。
セリフのログのモーダルを開いた画は `capture-view.ts --scene welcome-greeting-cleared --until-step 2 --click 'button:has-text("ログ")'`（空のログ）で撮れる。`--wait-for` は `--click` より前に待つのでモーダルの中の要素は指せず、開いたあとの要素は `--wait-after` で待つ。
**ワークフローの設定の面（歯車の `tw config` を読み書きする画）を、`tw` の出力を変えて撮るには `TSUKUMO_TW=<偽の tw の絶対パス>` を付ける**（schema 2 の面など、取り込みの `tw` が出さない形を撮るとき）。
偽の `tw` はスクラッチ（作業ツリーの外）に Write で書いて実行権を付ける。`vendor/tsukumo-plugins/bin/tw` は書き換えない（戻し忘れが main に混ざる）。PATH に偽の `tw` を置いても効かない（取り込みの `bin/tw` が先に選ばれる）。
`--scene` の `capture-view.ts` は起こす tsukumo に自分の環境変数を引き継ぐので、`TSUKUMO_TW=… node scripts/capture/capture-view.ts --scene <場面> …` の形で効く。`--scene` を付けずに起こし済みの tsukumo へ撮りに行くときは、その tsukumo を起こすときに付ける。
設定の面は hash では開かないので、歯車を押して開き、並びの欄を待つ（`--click 'button[aria-label="設定"]' --click 'nav[aria-label="設定の項目"] button:has-text("ワークフロー")' --wait-after 'ol[aria-label="並び"]'`）。
偽の `tw` は `config --schema` に schema 2 の JSON、`config --json` に `config` と `keys` を持つ JSON を返す（形は `workflow-setting-reading.ts` の `configSchemaSchema`・`configOutputSchema`）。形が違うと並びの欄は出ず、「tw が並び（schema 2）の設定コマンドを返さない」などの断りが出る。
ワークフローの面は 761px 以上の設定のダイアログにだけあり、760px 以下の引き出しの設定の面には無い。
狭い窓（720px）でセッションの切り替え画面を開くには、引き出しを開いたあとに `--click '[aria-label="引き出し"] button[aria-haspopup="dialog"]'` を足す（`--click 'button[aria-label="やり取りとタスクを開く"]'` のあと）。
**続きから復元した画面（`session-resume` の過去のやり取り）を撮るには、切り替え画面を開いて要求を選び、「切り替える」を押してから、復元された依頼の文を `--wait-after` で待つ。** 広い窓（900px 以上）では次の形で当たる（撮った画で、続きの最終レポートまで出ることを確かめた）。

```bash
node scripts/capture/capture-view.ts --scene session-resume --size 900x900 \
  --click '[aria-label$="押すとセッションを切り替える画面を開く"]' \
  --click '[role="option"]' \
  --click 'button:has-text("切り替える")' \
  --wait-after 'text=前のセッションの架空の依頼その1'
```

`[role="option"]` は要求の一覧の行（最初の1件）。押すのは行で選ぶだけで、切り替わるのは「切り替える」を押したあと。`--wait-for` は先頭で当たるので、切り替え画面の前には使えない（`--wait-after` を使う）。**狭い窓（760px 以下）では、切り替えたあとも引き出しが開いたままなので、`--press Escape` で閉じてから `--wait-after` で待つ。** 閉じる前に待つと、引き出しの中の一覧の依頼の文に当たって偽の成功になる。閉じたあとの本文に出るのは続きの最後の依頼（その3）なので、待つ文もそれにする。720px で撮った画で、引き出しが閉じて続きの最終レポートまで出ることを確かめた。

```bash
node scripts/capture/capture-view.ts --scene session-resume --size 720x900 \
  --click 'button[aria-label="やり取りとタスクを開く"]' \
  --click '[aria-label="引き出し"] button[aria-haspopup="dialog"]' \
  --click '[role="option"]' \
  --click 'button:has-text("切り替える")' \
  --press Escape \
  --wait-after 'text=前のセッションの架空の結論その3'
```

この手順を `--size 761x900` で走らせると、761px 以上では引き出しの口（≡）が無いので、最初の `--click` で「当てられなかった」と出て失敗する。広い窓の手順の 761px での当たりは未確認。
**待ち時間が経たないと出ない画（待ちの一言など）は `--advance <ms>` で偽の時計を進めて撮る。**
`Temporal.Now` も進んだ時刻に従うので、経過の秒数のような時刻の表示も進んだ値で描かれる。
**日付で表示が変わる部品（セッション切り替えの「今日/昨日」・プラン使用量の「…に戻る」）は `--clock <ISO 時刻>`（オフセット付き。例 `2026-01-15T12:00:00+09:00`）でブラウザの時計を決めて撮る。** 疑似セッションの日付と別の日を指せば区切りが変わる。

**URL を手で拾わずに1件だけ撮るときは `capture-view.ts --scene <場面>`。** fake driver の
tsukumo を空きポートで自分で起こし、配信 URL を待って撮り、終わったら（失敗しても）自分で
止める（`node scripts/runtime/stop.ts` を別に打たなくてよい）。URL を直に渡す使い方とは併用できない。
知らない場面名のとき・URL も `--scene` も無いときは、何も起こさずに理由を出して非0で終わる。
**場面の途中の画は `--until-step <n>`（`--scene` と一緒にだけ使える）。** 場面の手を先頭から n 個で
止めて流すので、止めた先の状態が残る（`opening` の手は数えない）。止めた先の要素は `--wait-for` で待つ。
`--scene` の撮影は、止めた先（`--until-step` が無ければ場面の最後）の手が画面に届くまで待ってから、
メインビューの静止を待って撮る。URL を渡す撮影は静止だけを待つので、遅い手で止めるときは
`--wait-for` でその手が出す目印まで待つ（`--advance` はページの時計だけでサーバの手は進めない）。
最終レポートまで流し切って待つときは `--wait-for '[class*="is-final_"]'`（`scripts/capture/lib/catalog-selector.ts`
の `WORK_PLAN_FINAL_SELECTOR` と同じ。`report-head` や `--advance` で待つと中間レポートや作業中の画を撮る）。
**差し戻された `report` と直した `report` の描画は、場面 `report-mermaid-rejected`**（疑似セッションは判定せず、場面の `tool-finished` の `isError` に従う）。
差し戻しの画は `--until-step 5 --wait-for 'text=流れを図にして出すね'`（本文に図が無く、吹き出しに直して出し直す一言が出る）、
描画の画は `--until-step 8 --wait-for '[class*="is-final_"]'`（図が描かれる）。
広い窓では吹き出しが1字ずつ出るので、最後の吹き出しの文では待たず、先に出る吹き出しの文を待つ。
**`svg` の塊（単独と `beforeAfter` の側）の描画は、場面 `report-svg`**（`--until-step 99 --wait-for '[class*="is-final_"]'`。`beforeAfter` は `--scroll-to '[class*="before-after_"]'`）。
**`graph` の色の目印（` @a`〜` @e`）・点線の辺（`-.>`）・`legend` の描画は、場面 `report-graph-tone`**（`--until-step 99 --wait-for '[class*="is-final_"]'`。群の枠・節点の枠・辺の色と凡例の色見本が合っているかを見る）。
**節点の多い `graph`（12 節点・囲み 3 つの LR）の幅の段と TD への差し替えは、場面 `report-graph-wide`**（`--until-step 99 --wait-for '[class*="is-final_"]'`。`--paper-metric` で図の文字の最小 px を数える）。
**入れ子の囲み（2 階層）と複数行の箱を持つ `graph` は場面 `report-graph-nested`、箱に件数を書いた LR の状態の流れ（戻りの辺は点線）が横 1 行に収まるかは場面 `report-graph-states`**（どちらも `--until-step 99 --wait-for '[class*="is-final_"]'`。`--paper-metric` で図の文字の最小 px を数える）。
**自然幅が読む面を超える `graph`（1 つの起点から 10 本に分かれる TD）の横転がしは、場面 `report-graph-scroll`**（`--until-step 99 --wait-for '[class*="is-final_"]'`。`pre.mermaid` が `data-measure="scroll"` になり、`pre` の中で横に転がる）。
**縦に長い図の高さと拡大は場面 `report-tall-figure`**（mermaid・svg・画像。`--reveal-at 30000`。拡大は `--click 'pre.mermaid'`）、**中間レポートの箱の中の塊の枠は場面 `report-interim-nested`**（`--click summary` で畳みを開く）。
**計画の返却を待つ間の帯（`delegatedRange` が `pending`。丸が「・」「…」「・」）は、場面 `work-strip-plan-pending`**（`--wait-for 'text=計画を書き直す'`）。
**幅で画面が切り替わる境目は 1100px と 760px。** 1100px 以下でサイドバーが柱に畳まれ、760px 以下で
頭・本文・顔と吹き出し・入力欄の縦の1列と引き出しになる。境目は `--size 1100x900` と `--size 1101x900`、`--size 760x900` と `--size 761x900` の両側を撮る
（`docs/architecture/screen-design.md`「13.4 Layout」「狭い画面（760px 以下）」）。
**どの場面にどの塊が出るかを引くときは `capture-view.ts --list-scenes`。** 場面ごとに `report`
に出る塊の `kind` を一覧し、`table` は状態のセル（`{ status, text }` の行）を持つものを
`table(status)` と区別する。検証結果の表（`report` の `checks`）を持つ場面には `checks` も出る。
行末の「演出: 掛かる見込み／掛からない見込み」は、書き上げる演出（`--reveal-at` が効くか）が掛かるかの見積もり
（`report` の節の文字数と図の重みの合計が約200以上なら掛かる。草稿は見ないので、見込みがあっても始まらない場面がある。
手順は `docs/architecture/testing/visual-check.md`）。

**部品を props で切り替えて並べる道は無い。** 描画の変更の `evidence` は `capture-catalog.ts`
（か手で起こした tsukumo）で、領域に入れたときの見え方を撮る。キャラビューの吹き出しは、
セリフが並ぶ `report`・反応が出る `api-failure`・`rate-limit`・`reaction-accepted`、
迎えの挨拶を書いている途中の「…」が出る `--scene welcome-greeting-cleared --until-step 3`、
セリフも反応も無い画が出る `--scene welcome-greeting-cleared --until-step 2` で撮れる。
立ち絵の素材が無いキャラ（吹き出しだけで成り立つ形）を描く場面は疑似セッションに無いので、
`characters/` に素材なしのパックを置いて起こした tsukumo で撮る。
