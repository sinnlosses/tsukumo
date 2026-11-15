# 会話の流れの並びのデータと、透ける面のぼかしの描画の負荷（2026-11-15）

ステータス: 一次情報（読んだ記録と測った値）。決定は `docs/architecture/adr/0058-three-column-single-stream.md` が持ち、この文書は値と測り方だけを持つ。

問い: (1) 依頼・セリフ・段・お伺い・レポートを、記録から1本の流れに並べられるか。時刻の無いものは何で順を決めるか。(2) 見本（`docs/history/mockup/conversation-directions-2026-11-15/layouts.html?layout=a2`）の透ける面のぼかしは、どれだけ描画の負荷を生むか。

## 流れの並びのデータ

- 記録（`SessionState.records`）は、届いた順に末尾へ足すだけで、並べ替えない。`records` を書く口は `grep -rnE '\brecords: ' src/shared/session src/server/session --include='*.ts'` の38行から、引数と型の宣言13行と、`turn.ts` の2行（`splitIntoTurns` がやり取りへ区切る値で、`SessionState` を書かない）を除いた23か所（2026-11-15 の作業ツリーで数えた）。複数行の `records: [` も1行目で拾う。

| 書き方               | 箇所                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 数  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| 末尾に足す           | `session-advance.ts:170`（`request`。`trimToRecentTurns` で古いやり取りを先頭から落とす）・`:186`（`aside`）・`:230`・`:243`（`work-plan`）・`:359`（`compact-boundary`）、`session-advance-workflow.ts:28`（`work-plan`）、`session-advance-record.ts:17`（`speech`）・`:51`（`report`）・`:83`（`tool`）・`:111`（`question`）、`session-record-edit.ts:65`（`detail`）、`turn-progress-fold.ts:71`（`turn-failure`）、`session-fold.ts:57`・`:98`（`reaction`） | 14  |
| 同じ位置で差し替える | `session-record-edit.ts:88`・`:108`（`report` の変更の要約と確かめた結果）、`tool-record.ts:30`・`:60`（`tool` の終わりと背景の完了の知らせ。`slice` で前後を挟む）、`session-fold.ts:112`（迎えの挨拶の文と表情）、`src/server/session/core/event/restored-event.ts:34`（時刻を `restored` に替える）、`src/server/session/core/event/restored-report-image.ts:58`（`report` の画像の置き場）                                                                     | 7   |
| 空にする             | `session-state.ts:272`（初期値）、`session-advance.ts:307`（`conversation-cleared`）                                                                                                                                                                                                                                                                                                                                                                               | 2   |

ファイル名だけのものは `src/shared/session/` の下。どの口も、既にある記録の順を入れ替えない。

- 時刻（`RecordTime`）を持つのは `request`・`aside`・`report`・`work-plan`・`speech`・`reaction` の6種類。`detail`（書きかけと中間の本文）・`question`（答え終わった質問）・`tool`・`compact-boundary`・`turn-failure` は持たない（`src/shared/session/session-record.ts`）。時刻を持つ記録でも、前のセッションから組み直したものは `restored`（時刻が分からない）になる。
- 疑似セッションの記録（実物の会話は読んでいない）の届く順は、たとえば `fixture/fake-session/phone-phases.json` が `request → work-plan ×5 → speech → tool-started → tool-finished → report → turn-finished`、`report-ask-answered.json` が `request → report → tool-finished → turn-finished → aside → speech → turn-finished`（`jq -r '[.steps[] | "\(.afterMs):\(.event.kind)"] | join(" ")'` で読んだ）。セリフ・段・依頼・補足・レポートが1本の記録の中で届いた順に並ぶ。

## 3列での本文の容器の幅（余白の札の境目）

問い: 3列の配置で、ADR 0055 の余白の札（本文の容器から余白 248px と間 24px を引いて 30em が残るときだけ出す）は何 px の画面幅から出るか。

### 測り方

- 境目の式は `src/browser/features/report/leaf/ask-box.css` の `@container report-body (min-width: calc(30em + 248px + 24px))`。コンテナクエリの `em` は容器の算出した字の大きさで解くので、本文の字 14px で 30em = 420px、境目は 692px。
- 見本 `layouts.html?layout=a2&scene=read` を `playwright-core` 1.64.1 の headless の Chromium で、高さ 900px・幅を替えて開き、500ms 待ってから、紙（`.sheet.paper`。見本で `container: report` を持ち、tsukumo の `[data-report-body]` にあたる要素）の `getBoundingClientRect().width` から左右の padding（32px ずつ）と縁を引いた幅と、`getComputedStyle` の `font-size` を取った。仕切りは見本の既定の幅（左の列 238px 相当・サイドバー 319px 相当）。スクリプトは作業ツリーの外の一時ファイルに置き、残していない。

### 値

| 画面の幅 | 紙の中身の幅 | 字の大きさ |
| -------- | ------------ | ---------- |
| 1101px   | 455px        | 14px       |
| 1300px   | 654px        | 14px       |
| 1340px   | 688px        | 14px       |
| 1345px   | 692px        | 14px       |
| 1400px   | 729px        | 14px       |
| 1652px   | 881px        | 14px       |
| 1920px   | 1032px       | 14px       |

### 読み取り

- 見本の3列では、約 1345px から余白の札が出る。1400px では本文が約 457px（729 − 248 − 24）残る。
- 1652px は、見本の紙が自分で持つ `@container report (inline-size >= 880px)`（お伺いの表の組み方）の境目で、余白の札の境目ではない。
- tsukumo の `[data-report-body]` の幅は紙の padding で変わるので、実物の値は会話の流れの段が測り直す。

## ぼかしの描画の負荷

### 測り方

- 見本 `layouts.html?layout=a2&scene=read` を 1400×900 で開き、2秒待ってから10秒のあいだに増えた CPU 時間を `ps -o cputime= -p <pid>` で、描画プロセス（`--type=renderer`）と GPU プロセス（`--type=gpu-process`）に分けて取った。
- ブラウザは `playwright-core` 1.64.1 の headless の Chromium。GPU は SwiftShader（ソフトウェアの描画。WebGL の `UNMASKED_RENDERER_WEBGL` で確かめた）なので、GPU の絶対値は実機の GPU より大きく出る。比べるのは同じ条件どうしの比で読む。
- ぼかしは、URL の `blur=8`・`blur=24` と、全要素の `backdrop-filter` を `none` に上書きした版の3通り。各条件を2〜3回測った。スクリプトは作業ツリーの外の一時ファイルに置き、残していない。
- 見本で動いていたアニメーションは4つ（`document.getAnimations()`）: `turns-fade-start`・`turns-fade-end`・`stream-fade-start`（スクロールの端の薄れ）と、進行の帯の状態の点の `breathe`（無限）。

### 値

| 場面（10秒）                         | ぼかし          | ぼかしを持つ要素 | 描画プロセス     | GPU プロセス        |
| ------------------------------------ | --------------- | ---------------- | ---------------- | ------------------- |
| 止まって見ている（`breathe` が動く） | 8px             | 7                | 1.2%・1.2%・1.2% | 61.5%・60.9%・61.2% |
| 同じ                                 | 24px            | 7                | 1.1%・1.0%・1.2% | 82.2%・80.5%・83.0% |
| 同じ                                 | なし            | 0                | 4.6%・3.6%・4.0% | 6.8%・5.7%・6.1%    |
| 会話の流れを毎フレーム送り続ける     | 8px             | 7                | 3.2%・3.3%・3.2% | 70.4%・70.3%・68.2% |
| 同じ                                 | 24px            | 7                | 3.2%・3.4%・3.0% | 92.1%・91.4%・90.4% |
| 同じ                                 | なし            | 0                | 4.8%・4.2%・4.2% | 27.7%・28.5%・29.1% |
| 全アニメーションを止める             | 8px・24px・なし | 7・7・0          | 0〜0.1%          | 0〜0.1%             |
| `breathe` だけを止める               | 8px・24px・なし | 7・7・0          | 0〜0.1%          | 0〜0.1%             |

### 読み取り

- 止まった画面では、ぼかしは負荷を生まない。負荷は、ぼかしの面の中か後ろで何かが毎フレーム描き変わるときに出る。見本で常時の負荷を生んでいたのは、ぼかしを持つ進行の帯の中の `breathe` 1つだけだった（止めると 61% → 0.1%）。
- 描き変わりがあるときのぼかしの代は、GPU プロセスでぼかし無しの約10倍（止まって見ている場面で 6% → 61%）。半径を 8px から 24px にすると 61% → 82% に増える。
- 今の画面の無限アニメーションのうち、3列の配置でぼかしの面の中に入るのは、進行の帯の回る印（`turn-card/work-strip.css` の `--spinner-animation`）。書いている途中のレポートの筆（`turn-card/report-draft.css`）は、段の札（ぼかしを持つ面）に載せると同じ代が掛かる。立ち絵の呼吸（`frame/portrait.module.css`）はぼかしの面の後ろに入らない（やり取りの列は立ち絵の上で止まる）。
- 会話の流れを送るあいだは、進行の帯と入力欄が流れの上に重なるので、ぼかしがあると送るたびに描き直す（送り続けて 28% → 70%）。送るのは利用者が操作しているあいだだけで、常時の負荷にはならない。

### 実タブの測定（Orca の実タブ・止まった画面）

既存の表（SwiftShader）とは別の測定で、値を混ぜない。

測り方:

- `pnpm run build` のあと、`TSUKUMO_DRIVER=fake TSUKUMO_FAKE_SCENE=report` で起こした tsukumo の URL を `orca tab create --url` で開いた（読む場面・止まった画面。幅 1477px）。
- 描画プロセスの pid は、開いた直後で CPU 時間が最小の `Orca Helper (Renderer)`（52155）、GPU プロセスは `--type=gpu-process`（22240）を `ps` から拾った。
- 10秒の前後で `ps -o cputime= -p <pid>` を読み、増えた CPU 時間（秒）を取った。開く前後に待ちは2秒置いた。
- ぼかしを外した版は `orca eval` で `document.body.style.setProperty('--panel-blur', '0px')` を当てた。既定とぼかし無しを交互に3回ずつ測った。
- ほかの作業ツリーのテストが同じマシンで動いていたので、値には揺れがある。

| 条件（10秒の CPU 時間・秒）   | 描画プロセス     | GPU プロセス     |
| ----------------------------- | ---------------- | ---------------- |
| 既定（濃さ45%・ぼかし8px）    | 0.33・0.25・0.19 | 0.72・0.84・0.63 |
| ぼかし 0px                    | 0.18・0.18・0.18 | 0.71・0.66・0.61 |
| 比（平均の既定 ÷ ぼかし 0px） | 1.4              | 1.1              |

比は両方とも 2 倍以内。

規則の確かめ（`getComputedStyle(el).backdropFilter`）:

- 既定で `backdrop-filter` が `none` でない要素を全件挙げると、上部の帯・やり取りの列・入力欄の本体（Astryx の atomic class の要素）・サイドバーの4つで、どれも `blur(8px) saturate(1.15)`。
- `--panel-blur: 0px` では、4つとも `none`。
- この場面（読む）に無い進行の帯・段の札・引き出しは測っていない。

無限アニメーションの列挙（`document.getAnimations()` の `iterations === Infinity`）:

- 全1件、`portrait-breathe`（立ち絵）。`backdrop-filter` が `none` でない祖先の中は 0件、外が1件。
