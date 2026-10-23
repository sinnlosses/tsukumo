# 7段の流れと見比べを、いまの記法で HTML 版並みに書けるかの試し（2026-10-24）

**正典ではなく、採用が決まるまでコードは1行も変わらない。** `docs/research/dashboard-layout-proposal.md` 5.1「推す順」の1（逃げ道の記法で試して、画を撮って目で見る）に当たる試しで、`src/` は変えていない。「`flow` と `compare` の欄を足すか」は、ここでは決めない。

## 試したこと

- **比べる相手**: 「tsukumo のレポートができるまで」を、Claude に素の HTML で書かせた版（`/tmp/tsukumo-report-pipeline/report-pipeline.html`。参照用で tsukumo には載せない）。7段の流れ（呼ぶ・検査・閉じる・記録・整形・描く・締め）と、「検査が受け持つ／整形が受け持つ」の見比べを対象にした
- **書いた版**: `report` の `markdown` の塊に、`cols` の中の `card`（頭は太字の題1行）と `badge-ok`・`badge-warn`・`badge-ng` だけで書いた。7段は `cols` を4枚と3枚に分け、見比べは `badge-warn`（書き直し）と `badge-ok`（削除）の札つきの2枚にした
- **撮り方**: `scripts/capture/capture-view.ts --scene report-board` に、疑似セッションの複製（`report-board` の塊の本文だけを差し替えたもの。依頼は架空）を `--session` で渡した。HTML 版は同じ道具に `file://` を渡して撮った。撮影のどれも「横のはみ出し: 0px」
- **比べた観点**: 枠・題・色分け・読む順

## 撮った画像

いちばん狭い幅は 390。

- notation 版、390x2800: `/private/tmp/claude-501/-Users-sinnlos-orca-workspaces-tsukumo-tsukumo-task/4d0a2e2a-c089-488b-aaab-26f4609ff2c5/scratchpad/notation-390x2800.png`
- notation 版、1400x2200: `/private/tmp/claude-501/-Users-sinnlos-orca-workspaces-tsukumo-tsukumo-task/4d0a2e2a-c089-488b-aaab-26f4609ff2c5/scratchpad/notation-1400x2200.png`
- HTML 版、390x3600（見比べの区画まで全体が入る）: `/private/tmp/claude-501/-Users-sinnlos-orca-workspaces-tsukumo-tsukumo-task/4d0a2e2a-c089-488b-aaab-26f4609ff2c5/scratchpad/html-390x3600.png`
- HTML 版、1400x2600（同上）: `/private/tmp/claude-501/-Users-sinnlos-orca-workspaces-tsukumo-tsukumo-task/4d0a2e2a-c089-488b-aaab-26f4609ff2c5/scratchpad/html-1400x2600.png`

画像はリポジトリに置かない。画像は受け入れまで残る場所に置いてある。

## 効いた点

- **見比べの色分け**: `badge-warn`（書き直し）と `badge-ok`（削除）の札で、2つの側が見分けられる。HTML 版の見比べの区画は、全体が入る画像（1400x2600 と 390x3600）で見ると、2枚とも同じ地で、題も同じ青のまま、側ごとの色を持たない。ここは notation 版のほうが強い。HTML 版に色分けがあるのは見比べの外で、緑の番号の丸と段の線、検査の段の赤い左線の箱、「report を呼び忘れたとき」の橙の左線の箱、見出しの左の緑の太線。利用者の「HTML のほうが色分けされている」は、この見比べではなく、これらに当たる
- **枠と題**: 各段・各側が角丸の枠に入り、太字の題1行が付く。この2点は HTML 版と同程度に読める
- **狭い幅の読む順**: 390 では縦に1枚ずつ積み、1→7 の順が保たれた。横のはみ出しは出なかった

## 足りない点

- **番号の丸と段をつなぐ線**: 記法に無い。題に「1.」と書いて代えたが、HTML 版の緑の丸と線に比べて目立ち方が弱く、段が列だという手がかりが無い
- **出どころの行**（HTML 版の灰色の小さい1行）: 記法に無い。ファイル名が本文の先頭のコード片に混ざり、題と本文の境が弱くなった
- **分岐の箱**（検査の段の「違反あり → 差し戻し」の赤い左線の箱。HTML 版の色分けの中心はここと緑の番号の丸）: 記法に無い。`badge-ng` の札は付いたが、分岐の文は本文の1文に埋もれる
- **横並びの読む順**: 1400 では、7段が 2列・2列・3列の折り返しになった。列数の違う段が並び、行の切れ目が見えない。5〜7 の枠は他より狭く、7 の題が2行に折れた。`report-notation.ts` の表が `cols` を「区画の間に読む順・因果が無いときだけ」としている条件から、7段の流れが外れる証拠になった

## 欄を足す案のどの候補に当たるか

`docs/research/dashboard-layout-proposal.md` 4章の候補（番号は同章の優先）と突き合わせた。

- **見比べの色分け**: 追加の欄は要らない。`badge` で足りる。候補2（節の右肩の札）は、札を節の見出しの行へ移す案で、色分けの強さそのものは足りている
- **横並びの読む順**: 候補1（`layout: "board"`）は2列の格子を機械が決める案で、列数をそろえる点は効きうる。ただし候補1は読む順を Z 字にしないための例外を足す案で、順のある流れは当たらない。流れは順を持つので、`cols` の折り返しで書かない側に倒すのが妥当
- **出どころの行**: 候補4（`list` の `style: "cards"`。項目ごとに `label`＝分類の札、`text`＝題と説明）の `label` が近い。分類の札を題の上や横に置く形で、出どころの行を `label` で代えられる見込み。ただし提案が書くとおり `options` のカードと取り違えうる
- **番号の丸と線・分岐の箱**: 当たる候補が無い。7段の流れは、いまの `list` の `style: "flow"`（番号の丸を1本の線でつなぐ縦の列。`src/shared/report/report-list-markdown.ts`）の欄を、段ごとの題・出どころ・分岐の枠に育てる案になる。これは `dashboard-layout-proposal.md` に無い新しい候補で、後段（欄を足すタスク）で決める
- **側ごとの色を持つ `compare`**: 見比べは `badge` つきの `card` 2枚で足りたので、`compare`（`src/shared/report/report-comparison-markdown.ts`）に側ごとの色を足す案は、優先を下げてよい

## 見立て

- 見比べは、いまの記法で HTML 版並み（色分けは上）に書ける。`compare` の欄を足さずに済む
- 7段の流れは、枠・題はいまの記法で届くが、番号の丸・線・出どころ・分岐の箱と、順を保つ並びが届かない。ここは `flow` の欄を足す案を後段で決める材料になる
- 記法の側では、`cols` を順のある流れに使わない（表の条件のとおり）

## 確かめていないこと

- 実際のモデルが、この形の `markdown` の塊を空行と入れ子の規則どおりに書くか（`dashboard-layout-proposal.md` 5.1 の1が残した点。ここでは Claude が手で書いた1回だけ）
- 書き上げる演出（筆）が、`cols` の中の `card` でどの順に進むか
- 390 と 1400 以外の幅（720 前後の中間）での折り返し
