# AGENTS.md

`mimikun/mimikun.scripts` — セットアップ用スクリプト置き場。

このファイルが実体で、`CLAUDE.md` はここを import しているだけ。
エージェント向けの指示を足すときは、必ずこちら側を編集する。

## 実装は `src/**` の TypeScript、実行は bun

bash / PowerShell / fish に分散していた同じ処理を、ここに1本化している最中。
**新しい処理は `src/**` に TypeScript で書く。`.sh` に足さない。**

nushell も候補だったが見送った（2026-08-02）。行数の多い処理が
「コマンド → 生成パターン」の対応表や pueue の依存グラフといった**データ構造の問題**で、
型が効くほうが利く。加えて nushell は 0.x でほぼ毎月破壊的変更があり、
毎日走らせるスクリプトの置き場としてはリスクが勝った。

- `src/lib/` — 共有部分。**OS 差・外部コマンド呼び出しはここに閉じる**
  - `platform.ts` パッケージリストのパス（`linux_*` / `windows_*` の差はここだけ。
    OS をまたいで同じものは `sharedPkgListPath()`）。`machineArch()` は
    `uname -m` 相当で、リリースのアセット名を組む用
  - `cmd.ts` `commandExists()` / `envVarSet()`
  - `shell.ts` `sq()` — pueue に渡すコマンド文字列のクォート
  - `pueue.ts` `pueue add` の薄いラッパー。`TaskId` は branded type
  - `runner.ts` `--no-pueue` / `--dry-run` / `--serial` / `--after` の解釈と実行。
    `run()` / `runChain()` はハンドルを返し、それを `after` に渡して依存を組む
  - `cargo.ts` `cargo install-update --list` の唯一のパーサ
  - `fish.ts` fish 補完の置き場
- `src/{generate,install,update,misc}/` — 実行可能スクリプト。`#!/usr/bin/env bun`
  - **各 updater は `enqueue(dispatch)` を export し、CLI 起動は
    `if (import.meta.main)` の下に置く。** `src/update/all.ts` が全部を
    **1つの dispatcher で**取り込むため。ここを別プロセス起動にすると、
    依存を pueue の実 task id で渡すことになり `--dry-run` が成立しなくなる
- ルートの `*.sh` に実装は無い。`vup.sh` は `sudo -v` を取ってから
  `src/update/all.ts` に渡すだけ（bun が起動する前にパスワード入力を
  端末へ届ける必要があるため、ここだけ shell に残っている）

新しいスクリプトには必ず `--dry-run` を持たせる。移管の前後で
「積まれるコマンド集合が変わっていないこと」を差分で確認するため。
**そのため stdout に出すのは積まれるコマンドだけ。進捗・警告・スキップの通知は
stderr へ出す**（`note()` がそうしている）。混ぜると差分が取れなくなる。

### 移管の検証手順

**移し替えたら、必ず旧実装と「積まれるコマンド集合」を突き合わせる。**
目視やレビューでは、これまで見つかった不具合はどれも見つからなかった。

1. 旧実装が `pueue` を呼ぶなら、**渡された内容を記録するだけの偽 `pueue` を PATH の先頭に置いて実走させる。**
   `-p` / `--print-task-id` が来たら連番を返さないと、呼び出し側の
   `task_id=$(pueue add -p ...)` が壊れて途中で止まる
2. 旧実装がファイルを書くなら、退避してから旧パイプラインを直接実行し、出力を保存する
3. 新実装を `--dry-run`（またはファイル生成）で走らせ、`sort` して `diff`
4. **引用符の付け方は実装で変わるので、比較前に正規化する。**
   `sed "s/'//g"` 程度で足りる。ここを飛ばすと、意味の同じ差分に埋もれて本物の差分を見落とす
5. **残った差分を1件ずつ説明できる状態にする。** 説明できない差分は、たいてい移し漏れ

呼び出し側ごとに pueue の積み方が違うことがある。**その違いはフラグで表現し、
実装を分けない。** 現状 `--serial`（各タスクが前のタスクを待つ。cargo のビルドを
1本ずつ流す）と `--after <id>`（外から渡された依存を待つ）の2つ。

**コミット前に `task check` を通す**（`biome check --write` → `tsc --noEmit`）。
個別に回すなら `task lint` / `task fix` / `task typecheck`。

### `~/.claude/rules/typescript.md` から意図的に外している点

グローバルのルールは prettier + eslint と pnpm を指定しているが、この repo は次の2点で外れる。
**グローバル側は変えていない**（他プロジェクトの既定として妥当なため）。

- **formatter / linter は biome。** 小さな CLI スクリプト群で、React も型情報を使う lint も要らない。
  prettier + eslint の2ツール構成は設定ファイルと依存が増えるだけで見合わない
- **パッケージマネージャは bun。** ここは bun をランタイムとして選んだ repo なので、
  インストーラだけ pnpm にする理由がない

### 呼び出し元

移管済みの処理は、外から**シム経由でここを呼ぶ**。シムには実装を書かない。

- **Linux**: chezmoi の `private_dot_local/bin/executable_*` → `~/.local/bin` に配備。
  リポジトリの場所は `${MIMIKUN_SCRIPTS_DIR:-$HOME/scripts}`
- **Windows / pwsh**: chezmoi の `dot_config/powershell/Microsoft.PowerShell_profile.ps1.tmpl` の
  `Invoke-MimikunCargoScript`。同じ環境変数で解決する
- ルートの `*.sh`（`generate.sh` / `install.sh` / `vup.sh`）

**シム側の変更は chezmoi のソースを編集して `chezmoi apply`。** 配備先を直接編集すると drift になる。

**シムが読むのは GitHub ではなく `$HOME/scripts` の作業ツリー。**
つまり `~/scripts` を、まだ移管先ファイルが無いブランチに切り替えると、
配備済みコマンドがその場で壊れる。**移管の PR をマージしたら、
ブランチを動かす前に `git switch master && git pull` を先に済ませること。**

PR は「移管先 → シム → 死んだコピーの削除」の順にマージする。
シムは移管先のファイルが master にあることを前提にするため。

移管済み: `vup` 本体、パッケージリストの生成（9種）と導入（8種）、cargo の update、fish 補完、
docker compose プラグインの update、mise の `ref:` ピン、`editorconfig`。

**移すのではなく消えたもの:** chromedriver / geckodriver / twitch-cli（mise と aqua へ）、
`update_pnpm`（`pnpm self-update` に置換）、`update_mise` の4サブコマンド中3つ
（`mise upgrade` が既にやっていた）。

**補完やパッケージのような「対象が増え続けるもの」は表にする。**
`src/update/fish-completions.ts` がその形。ツールを足す作業が
配列に名前を1つ書くことになり、`if` を1ブロック増やすことにならない。

### 移管元（まだ残っている重複）

未移管の処理は、今もここ以外に実装がある。移管するときは**こちらを正として読む**こと。

- chezmoi の `private_dot_local/bin/executable_*` — 移管済み以外の18本
- chezmoi の PowerShell プロファイル — cargo と editorconfig 以外の関数。
  **`Invoke-MimikunScript` が呼ぶパスは、足したら必ず実在を確認する。**
  2026-08-03 まで `src/generate/cargo-package-list.ts` と
  `src/install/cargo-packages.ts` を指したままで、どちらも改名後は存在しなかった。
  Windows でしか踏まない上に「mimikun.scripts not found」と出るので、
  repo が無いのかファイルが無いのか読んでも分からない
- `mimikun/mimikun.sh` の `src/**` と `powershell/**` は 2026-08-03 に削除済み。
  2026-02 以降どこからも読み込まれていない死んだコピーだった。
  **あのリポジトリを移管元として読まないこと。** 残っているのは README（行き先の対応表）と
  設定ファイルだけで、消したコードは git 履歴から拾える

### 移管先は TypeScript とは限らない

**葉に着手する前に、まず既存のパッケージマネージャで済まないかを確認する。**
2026-08-03 に `update_chromedriver` / `update_geckodriver` / `update_twitch_cli` を
片付けたとき、3本とも TypeScript を1行も書かずに済んだ。

- chromedriver → mise の `http:` backend（Chrome for Testing の
  `LATEST_RELEASE_STABLE` を `version_list_url` に食わせる）
- geckodriver → mise の `github:` backend。`ubi:` は 2027.1.0 で削除予定なので使わない。
  `github:` は artifact attestation と SLSA provenance も検証する
- twitch-cli → aqua 標準レジストリ。ネストしたバイナリパスと SHA256 検証を
  レジストリ側が持っている

**判断: パッケージマネージャで表現できるものは、ここへ移さない。**
移管の問いは「shell から TS へ」ではなく「shell からどこへ」。
自前の更新スクリプトは**壊れても失敗しない**ので気づけない —
`update_chromedriver` は廃止されたエンドポイントが 404 ではなく古い値を返し続けたため、
3年間 Chrome 114 を正解と信じて動き、毎回「Update found!」と表示していた。
実際の Chrome は 151 で、chromedriver は起動できない状態だった。
**この repo に置くのは、パッケージマネージャに載らないものだけにする。**

### マシンごとに要否が変わる処理は、消さずに実行時に判定する

`update_docker_compose` はこのパターンの1本目。Docker Desktop のマシンでは不要
（compose プラグインを Docker Desktop 自身が配り、`cli-plugins` の他の項目は
すべて自分のツリーへのシンボリックリンク。そこへ手動ダウンロード版を上書きすると
Docker Desktop の更新と綱引きになる）だが、Docker Engine のマシンでは要る。

**「このマシンで要らない」は削除の理由にならない。** 判定を実行時に持たせる。
`src/update/docker-compose.ts` は `~/.docker/desktop` の有無で見ている
（daemon 不要・WSL 固有でもない。`docker info` はデーモンが落ちていると失敗し、
プラグインのシンボリックリンクは過去の自分の実行が実体ファイルに変えてしまっていて
signal にならない）。

### 同じ処理の2実装は、必ず片方が壊れている

`update_mise` の移管で3件出た。**どれもエラーを出さない壊れ方。**

- `zig-master` は `mise uninstall zig@ref:master` を積んでいたが、設定は
  `zig = ["master", ...]`。`ref:master` は存在しないので空振りする。
  同じ処理が `vup.sh` にインラインでもあり、**そちらは `zig@master` で正しかった**
- `paleovim-latest` は `mise current vim`（vim が2つ設定されているので
  `"ref:master 9.2.0894"` と**2つ**出る）を `mise latest vim`（`"9.2.0901"`）と
  比較していた。永久に一致しないので、**毎回 vim をソースから再ビルドしていた**
- `zig-latest` はどこからも呼ばれず、`$MISE_DATA_DIR` 未設定のまま
  `$MISE_DATA_DIR/installs/zig/...` を読んでいた

**重複を見つけたら、片方を消す前に両方の出力を比べる。** どちらが正しいか
決めずに「新しいほう」「呼ばれているほう」を残すと、壊れた側を残す確率が半分ある。

### 動いていないコピーに機能を足しても、誰も気づかない

`vup.sh` と chezmoi の `executable_vup` は長く並存していたが、
**実際に叩かれていたのは `vup.sh` のほうだけ**だった（`vup` という名前で PATH に
出ていたのは chezmoi 側なので、`command -v` では逆に見える）。
その結果、chezmoi 側にしか無かった3つが**静かに実行されなくなっていた**。

- `paru -Syu` — OS パッケージの更新そのもの
- `update_fish_completions`
- `generate_cargo_package_list`

**「移管済み」を数えるときは、移管先が実際に呼ばれているかまで見る。**
`grep` で呼び出し元が1つしか無いなら、それが死んでいれば機能ごと死ぬ。
2026-08-03 に3つとも `vup.sh` へ戻し、chezmoi 側はシムにした。

**このとき OS パッケージ更新を `paru` だけに絞ってしまい、apt / brew を落とした。**
気づいたのは `mimikun.sh` を消そうとして `apt-packages.sh` に対応物が無いと分かったとき。
**死んだコピーを消す前に「これの生きた対応物はどれか」を1件ずつ言えるようにする。**
言えないものが残っていれば、それは移管漏れであってゴミではない。

### OS の判定はコマンドの有無で行う。OS 名の表を持たない

引退した `vup` は `os_info -t` の出力を3つの文字列と比較していた。知らない OS では
静かに何もせず、Mac の枝は**どこにも存在しない `brew_update`** を呼んでいた。
`src/update/all.ts` の `OS_PACKAGES` は `paru` / `apt` / `brew` が PATH にあるかで
判定する。OS 名の対応表が要らず、paru と Homebrew が同居するマシンでは両方走る。

### 次の一歩

**shell の実装はもう無い。** `vup.sh` は `sudo -v` を取って `src/update/all.ts` に
渡すだけになった。

残っているのは、まだ手つかずの葉。

1. **`mimikun/mimikun.sh` のアーカイブ。** コードの削除は 2026-08-03 に済んでいる
   （`mimikun.sh#127`）。**アーカイブは外向きの操作なので、実行前に必ず本人に確認する。**
   `gh repo archive` を勝手に叩かないこと。ファイル削除とは別の判断
2. chezmoi の PowerShell プロファイル — cargo と editorconfig 以外の関数。
   `all.ts` は Windows でも動くので、`Invoke-*` を減らせる余地がある
3. chezmoi に残る18本。`update_pip_packages` / `update_poetry` / `update_brew` あたりが次。
   **着手前に、まず既存パッケージマネージャで済まないかを確認する**（上の節）

**`vup --dry-run` が使えるようになった。** 何か変えたら、変更前後の出力を
`sed -E 's/^pueue add (--after [^-]*)?-- //' | sort` で正規化して diff する。
2026-08-03 の移管はこれで140タスク・依存41本の一致を確認した。

**2026-08-16 に一度 `vup --dry-run` を回し、cargo と fish 補完が積まれているか見る。**
積まれていなければ、どこかの移管で必須の分岐を1つ落としている。

**同じ日に `chromedriver --version` と `google-chrome-stable --version` の
メジャーが一致しているかも見る。** ずれていれば Stable 追従では足りないという意味なので、
`src/update/chromedriver.ts` を書く（`google-chrome-stable --version` から
メジャーを取り、`LATEST_RELEASE_<major>` を引く形）。

## Agent skills

### Issue tracker

Issue は GitHub Issues（`mimikun/mimikun.scripts`）で管理し、`gh` CLI で操作する。
See `docs/agents/issue-tracker.md`.

### Triage labels

デフォルトの5ラベル（`needs-triage` / `needs-info` / `ready-for-agent` /
`ready-for-human` / `wontfix`）をそのまま使う。
See `docs/agents/triage-labels.md`.

### Domain docs

single-context — ルートの `CONTEXT.md` と `docs/adr/`。どちらも未作成でよい。
See `docs/agents/domain.md`.
