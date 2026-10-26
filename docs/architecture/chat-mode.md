# 雑談モード

記憶の形の提案は `docs/research/chat-memory-index.md`。
ステータス: **正典**。

責務: レポートを出さない場としての雑談モードの仕様（遡れる幅、記憶の層と忘却、定着、
会話のアーカイブ、人格への書き戻し）を持つ。記憶（アーカイブ・あらすじ・定着）は
仕事のセッションとも1つで、仕事の側で書くもの・載せるものもここが持つ。それ以外の機能要件は `docs/requirements.md`。
読む時: 雑談モードに触るとき。
直す時: 雑談モードの仕様を変えたとき。

## このドキュメントの読み方

節の本文は子のファイル（`docs/architecture/chat-mode/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

**「4.9」は、この親と子の全体を指す識別子として残す**（移す前の `docs/requirements.md` の節の番号。
見出しとしては親にも子にも無い）。コード・テスト・`docs/history/` から素の「4.9」で指している箇所が多く、
番号を識別子として保つため詰めない。`chat-mode.md 4.9「句」` の参照は、句を親と子の全体で探す。

**ここには決定と、いまも効いている理由だけを置く。** 採らなかった案・ユーザーの発言の引用・
実測の数字と測り方は `docs/history/decision.md` の「chat-mode.md 4.9 …」の節にある。
**ファイルの形・上限・書く順・読み戻し方もここが持つ。** `~/.tsukumo/` のどこに置き、どの機能の
`core/` / `adapter/` が書くかは `docs/architecture/character-pack.md`「会話の記録の置き場」、
規約の例外の範囲は `docs/coding-standards.md`「会話内容の扱い」の表が持つ。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                               | 説明                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `docs/architecture/chat-mode/consolidation-failure.md` | 定着が書けなかったあとの扱い（縮みの逃がし口・間引き・止め方・診断ログの足跡）を持つ。                     |
| `docs/architecture/chat-mode/consolidation.md`         | 定着がいつ走り、何を渡し、何を受け取り、どう排他するかを持つ。                                             |
| `docs/architecture/chat-mode/conversation-archive.md`  | アーカイブに何をどんな形で書き、どう読み戻し、いつ消すかを持つ。                                           |
| `docs/architecture/chat-mode/memory-layers.md`         | 記憶を層で持つ決定、容量の表の値とその根拠、忘却が起きる縁と画面への出し方を持つ。                         |
| `docs/architecture/chat-mode/mode-and-switch.md`       | 雑談モードの入口の仕様（モードとして分けること、仕事のときから変わるもの、切り替えの道、遡れる幅）を持つ。 |
| `docs/architecture/chat-mode/persona-writeback.md`     | 書き戻してよい範囲、`remember` / `forget` の口、外部由来の印、上限、書き方と消し方、元に戻す手を持つ。     |
| `docs/architecture/chat-mode/synopsis-and-topics.md`   | あらすじの置き場・書き直し・載せ分け・話題の見出し・縛りの表を持つ。                                       |
| `docs/architecture/chat-mode/synopsis-file.md`         | あらすじの写し（`~/.tsukumo/chat-summary/<パック名>.summary.json`）の形と書き方を持つ。                    |
| `docs/architecture/chat-mode/verbatim-readback.md`     | 作業記憶（直近の逐語）の容量の決め方、画面との入れ子、`systemPrompt` への載せ方を持つ。                    |
