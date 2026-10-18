# 出力の分離（セリフと詳細）: 検証結果の描き方

戻り: `docs/architecture/display.md`「出力の分離（セリフと詳細）」

- **検証結果はカードで描き、`figure` と所要時間を載せる**（2026-09-28 ユーザー決定。文字を並べた帯では
  結果をひと目でつかみにくく、所要時間も出ていなかった）。
  - カードの形は表に置き換えた（経緯は `docs/history/decision.md`「display.md 4.2 検証結果の描き方（所要時間をモデルに書かせた条とカードの形）」）
  - **`figure`** はモデルが書く、結果を1つの数で言う短い文字列（「2849 / 56」「25px」など）。数で
    言えなければ空文字で、描かない。**数だけを書かせ、「が通過」のような述語は付けさせない**
  - **`detail` は NG・未確認の理由だけを書く欄で、ok のカードには描かない**（2026-09-28 ユーザー決定。
    ok の detail には「が通過」のような言わずもがなの述語や、打ち直した経緯のような利用者に要らない
    文が入っていた。心がけの条ではなく描かないことで塞ぐ）。detail の長さで差し戻す仕組みは、
    それでも経緯が混ざるようなら足す
  - **所要時間は tsukumo が測った値だけを出す。** モデルは確かめに打った Bash のコマンドを
    **`command` に打った文字列のまま**書き（コマンドでない確認は空文字）、tsukumo は同じやり取り
    （最後の依頼より後）の `tool` の記録のうち、`Bash` の `command` が**完全一致する最後の1件**の
    所要時間を添える（サブエージェントの中の呼び出しも含む。所要時間の測り方は「依頼の手順」と同じ
    `toolDuration` で、復元した記録は測れないので添えない）。一致しなければ添えない。
    **モデルに時間を書かせる欄は作らない**（2026-09-27 に外した理由がそのまま効く）。段ごとの所要時間も同じく
    tsukumo が記録から求め、最終レポートでは検証の表の下に1本の帯と一覧で、中間レポートでは目録の1行に描く（「ワークプラン」の節）
  - **`run_in_background` の Bash は、走りだした時刻から完了の知らせが届いた時刻までを所要時間にする**
    （2026-10-06 利用者決定）。その tool_result は起動を受け付けた時点（約0.3秒後）で返るので、tool_result の時刻で
    測ると起動の瞬間の時間になる。知らせは SDK の `system` / `task_notification` で、`tool_use_id` で記録に結ぶ
    （変換は `background-tool-finished`、記録の側は `tool` の記録の `backgroundEnd`）。**知らせが届かない・結び付けられない
    ときは、起動の瞬間の時間を出さず空にする。** 完了を待つ別の Bash（待ちのループ）を挟んでも、測るのは背景の Bash
    そのもの。背景かどうかは記録の `input` の `run_in_background === true`（Bash だけ）で決める。記録の形が変わったので
    `PROTOCOL_VERSION` を 41 に上げた。依頼の手順の所要時間も同じ `toolDuration` を通るので同じ値になる
  - 背景の Bash の知らせの形（2026-10-06 に SDK 0.3.288・本物の claude で実測。キーと型だけを見て、文面は記録していない）:
    - 届く順は `tool_use`（input に `run_in_background`（boolean））→ `background_tasks_changed`（`task_id` /
      `task_type` / `description` だけで `tool_use_id` は無い）→ `task_started`（`task_id` / `tool_use_id` /
      `description` / `is_backgrounded`（true）/ `task_type`（`local_bash`））→ `tool_result` → `result`。完了したときに
      `background_tasks_changed`（空）→ `task_updated`（`task_id` / `patch.status` / `patch.end_time`（エポックミリ秒））→
      `task_notification`（`task_id` / `tool_use_id` / `status` / `output_file` / `summary`。Bash では `usage` は無い）が
      同じミリ秒に届く。時刻を持つのは `patch.end_time` だけで、`task_notification` 自身は持たない。終わりの時刻には
      知らせが届いた時刻（`StampedEvent.at`）を使う
    - 鍵: `task_notification` の `tool_use_id` が Bash の `tool_use` の id と一致する。tool_result の文面は読まない。
      サブエージェントの中の背景の Bash も、`task_started` / `task_notification` が `parent_tool_use_id` 無しでメインの流れに
      届き、`tool_use_id` は中の Bash の id と一致する。tool_result の `tool_use_result.backgroundTaskId` はメインの Bash にしか
      載らないので鍵にしない
    - 前景の Bash・前景のサブエージェントも、数秒を越えると `task_started`（`is_backgrounded` が false）と
      `task_notification` が届く（tool_result の約5ms前）。なので知らせは背景で走らせた Bash の記録にだけ効かせる
  - 突き合わせはメインビューの組み立て（`main-view.ts`）で描くたびに行い、所要時間を記録には持たない。
    `figure` / `command` の無い前の形の記録は、2つを空文字として読む（`parseReportChecks`）。
    `report` のイベントの形が変わったので `PROTOCOL_VERSION` を 24 に上げた
- **検証結果はカードでなく、1項目1行の表で描く**（2026-09-28 ユーザー決定「案A」。毎回出る脇役なのに
  1項目1枚のカードは箱と段が多く、場所を取っていたため）。入力の形（`status` / `label` / `figure` /
  `command` / `detail`）は変えない。**表の形は 2026-10-04 に判定の札へ、2026-10-17 に下の「総括行と開く行で描く」へ置き換えた**
  （4列の grid・左の縦罫は使っていない）
  - `figure` の書式は「56 件中 1 件」のように何の数かを付けて描かせ、「2849 / 56」のような割り算・
    分数に見える書き方はさせない（`REPORT_CHECKS_DESCRIPTION` と `reportCheckSchema` の `figure` の
    `describe`）
- **検証の総括とお願いの合図を、結論のすぐ下の1行（合図の行）に置き、通った検証は畳む**（2026-10-03。
  提案書 `docs/research/report-redesign.md` 3.1 の骨格の段。1400×900 の窓ではメインビューが 513px しか無く、
  検証の表を常に全行開いていたので、末尾のお願いが最初の1画面に入らなかった）。**合図の行の中身は
  2026-10-04 に判定の札へ置き換えて**総括の文・`<details>` での畳み・「お願い 1 ↓」の口をいったん外し、
  2026-10-17 に下の「総括行と開く行で描く」で総括行・畳み・お願いの印を戻した
  - 並びは「目録の1行 → 見出し（`task` があるとき）→ 結論 → 合図の行 → 本文の節 → お願い」。中間レポートを
    最終レポートの上に時系列で積むのは変えない
  - 合図の行は帯と同じく `main-view.ts` の `reportMarkdown` が本文の HTML に組み（検証の部分は
    `reportChecksMarkdown`）、節の始まりの印より前に置く。書き上げる演出は節にだけ掛かるので、結論と合図の行は
    最初から出る
  - **所要は合図の行に置かない**（経過と所要は進み具合の帯の1か所。`docs/architecture/screen-design.md` 13.13）
- **検証結果は、総括行と開く行で描く**（2026-10-17。提案書 `docs/research/report-excellence-strategy.md` 3.1「判決の頭」。
  確かめていない行が検証の行の約4分の1あるのに「どう確かめればよいか」が無く、お願いは末尾にあって上端に印が
  無かったため。見本は `docs/history/mockup/report-excellence-2026-10-17/after-first.png`（題の位置は採らない）。
  それまでの形は、2026-10-04 の左の判定の札〔`docs/history/mockup/report-checks-tile-2026-10-04.html`〕と、
  2026-10-08 の左の色罫と小見出しの一言のカード〔`docs/history/mockup/report-verdict-quiet-2026-10-08.html`〕）
  - **合図の行**（`role="group"`・`aria-label="検証結果"`）は検証結果だけを運ぶ。`checks` が空なら行ごと置かない
  - **枠と地を持たない**。上下と行の間を `--rule-quiet` の 1px の罫で区切り、色が出るのは記号と状態の語
    （✓ 通った・？ 確かめていない・✕ 落ちた）だけ
  - **総括行**: 「✓ 検証 n件 通った <通った行の `figure` を `·` で連ねる>」「？ k件 確かめていない」「✕ m件 落ちた」を
    この順に並べ、無い部分は出さない（通った行が無ければ頭は「検証」の語だけ）。幅が足りなければ折り返す
  - **お願いの印**: `favor` があるときだけ総括行の右端に「● お願い 1 ↓」を置く。お願いの本体は末尾のままで、
    印はページ内のリンク（`#favor-<toolUseId>`。お願いの塊がこの `id` を持つ）で飛ぶだけ。押しても `location.hash` は
    書かずに転がす（`markdown-renderer.tsx` の `Anchor`）。演出の途中で押すと、押す操作が演出を打ち切って全部出してから転がる
  - **開くのは `ng` と `unverified` の行だけ**（`ng` → `unverified` の順。同じ状態の中は書いた順）。左の列に記号と
    状態の語、右の列に「`label` ＋ `figure`・所要時間」、その下に `detail`、`unverified` ならさらに「確かめ方: <`howToVerify`>」を置く。
    問題の並びは `role="table"`・`aria-label="検証結果の問題"`
  - **通った行は1行に畳む**: 「✓ 通った n件」と `label` の頭（最初の全角の括弧「（」より前。無ければ全文）を `·` で
    連ねた `<summary>` の `<details>`。開くと ✓・`label`・`figure`・所要時間の一覧（`role="table"`・`aria-label="検証結果"`）。
    全部通ったときも総括行とこの1行だけにする。開閉は保存しない
  - **`howToVerify`**（確かめ方）は `unverified` の行で必須、`ok`・`ng` では空文字。空の `unverified` は記法の違反
    `unverified-without-how` で差し戻す（規約違反の1ターン1回の枠）。欄の無い前の形の記録は空文字として読む
    （`parseReportChecks`）。`report` のイベントの形が変わったので `PROTOCOL_VERSION` を 54 に上げた
  - 部品が class を解決するのは `div`・`span`・`ol`・`li` だけなので、`<details>` とリンクは `checks-passed`・`checks-summary-favor` の
    `span` / `div` で包む
  - class（`verdict` / `checks-summary` 系 / `checks-problem` 系 / `checks-passed` 系 / `check` 系と
    `conclusion-lead`）は `REPORT_DRAWN_MARK_NAMES` に置く
