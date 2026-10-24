# 雑談モード

記憶の形の提案は `docs/research/chat-memory-index.md`。
ステータス: **正典**。

責務: レポートを出さない場としての雑談モードの仕様（遡れる幅、記憶の層と忘却、定着、
会話のアーカイブ、人格への書き戻し）を持つ。記憶（アーカイブ・あらすじ・定着）は
仕事のセッションとも1つで、仕事の側で書くもの・載せるものもここが持つ。それ以外の機能要件は `docs/requirements.md`。
読む時: 雑談モードに触るとき。
直す時: 雑談モードの仕様を変えたとき。

## このドキュメントの読み方

節の本文は子のファイル（`docs/architecture/chat-mode/`）にある。下の索引で節を1つ特定し、その子のファイルだけを開いて読む。

**「4.9」は、この親と子の全体を指す識別子として残す**（移す前の `docs/requirements.md` の節の番号。
見出しとしては親にも子にも無い）。コード・テスト・`docs/history/` から素の「4.9」で指している箇所が多く、
番号を識別子として保つため詰めない。`chat-mode.md 4.9「句」` の参照は、句を親と子の全体で探す。

**ここには決定と、いまも効いている理由だけを置く。** 採らなかった案・ユーザーの発言の引用・
実測の数字と測り方は `docs/history/decision.md` の「chat-mode.md 4.9 …」の節にある。
**ファイルの形・上限・書く順・読み戻し方もここが持つ。** `~/.tsukumo/` のどこに置き、どの機能の
`core/` / `adapter/` が書くかは `docs/architecture/character-pack.md`「会話の記録の置き場」、
規約の例外の範囲は `docs/coding-standards.md`「会話内容の扱い」の表が持つ。

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                                               | 題                                   | 節                                                                                          |
| ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `docs/architecture/chat-mode/consolidation-failure.md` | 雑談モード: 定着が落ちたとき         | 縮みの検査の逃がし口 / 続けて落ちたら契機を間引く / 続けて落ちたら止める / 落ちた理由の足跡 |
| `docs/architecture/chat-mode/consolidation.md`         | 雑談モード: 定着                     | 窓から溢れた会話は定着で畳む                                                                |
| `docs/architecture/chat-mode/conversation-archive.md`  | 雑談モード: 会話のアーカイブ         | 会話のアーカイブ                                                                            |
| `docs/architecture/chat-mode/memory-layers.md`         | 雑談モード: 記憶の層と容量と忘却     | 記憶の圧縮と忘却: 層と容量と忘却                                                            |
| `docs/architecture/chat-mode/mode-and-switch.md`       | 雑談モード: モードと切り替え         | 雑談モード / 雑談モードで変わるもの / 切り替え方 / どこまで遡れるか                         |
| `docs/architecture/chat-mode/persona-writeback.md`     | 雑談モード: プロフィールの書き戻し   | プロフィールの書き戻し                                                                      |
| `docs/architecture/chat-mode/synopsis-and-topics.md`   | 雑談モード: あらすじと話題           | 記憶の圧縮と忘却: あらすじと話題                                                            |
| `docs/architecture/chat-mode/synopsis-file.md`         | 雑談モード: あらすじの写しのファイル | 形 / 旧い形 / 書く順と、途中で落ちたとき                                                    |
| `docs/architecture/chat-mode/verbatim-readback.md`     | 雑談モード: 直近の逐語の読み戻し     | 記憶の圧縮と忘却: 直近の逐語                                                                |
