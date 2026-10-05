# 委譲先のエージェント定義に「ファイルは Edit/Write で書く」を入れ、シェル経由の書き込みが hook に拒まれる打ち直しを無くす（振り返り: GH-394）

- 札: 黄 揺れ（14回目）
- 根: subagent-shell-file-write
- 根拠: 2026-10-06 の1セッションで、委譲先3件（GH-380・GH-382・GH-394）がいずれも python か heredoc でファイルを書こうとして `scripts/deny-sed-in-place.ts` に拒まれ、Edit/Write で打ち直した。GH-394 では依頼文に「Edit/Write で書く」と明記していても起きた。1回の損は1往復だが、委譲のたびに出る
- 出し先: claude-skills の `agents/no-delegate.md` の本文に「ファイルの作成・書き換えは Edit/Write で行い、シェル（python・sed・heredoc のリダイレクト）で書かない」を1行足す（依頼文の1行では効かなかったので、毎回読まれる定義の側へ寄せる）
