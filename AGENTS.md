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
  - **例外は `src/misc/pip-roots.py` の1本だけ。** 対象の python 環境の
    `importlib.metadata` を読むのが仕事なので、**その interpreter 自身で
    走らせる必要がある。** TypeScript から呼ぶと `python -c` に本文を
    埋め込むことになり、読めなくなる
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

**chezmoi の `dot_config/fish/` は同じ形の死んだツリー**（2026-08-05 に踏んだ）。
`.chezmoiignore.tmpl` の `.config/fish/**` が条件分岐の外にあるので**全マシンで
配備されない。** 生きているのは `mimikun/mimikun.fish-config`（`~/.config/fish` に
チェックアウト、環境変数は `config/env_paths.fish`）。

**fish の設定を触るときは、まず `chezmoi managed | grep fish` を見る。**
空なら chezmoi 側は関係ない。`dot_config/fish/config.fish.tmpl` は 21.5KB あって
本物に見えるので、ファイルの存在では判定できない。`chezmoi apply` が
`not managed` と言って初めて分かった — **`chezmoi add` した時点では何も言われない。**

### OS の判定はコマンドの有無で行う。OS 名の表を持たない

引退した `vup` は `os_info -t` の出力を3つの文字列と比較していた。知らない OS では
静かに何もせず、Mac の枝は**どこにも存在しない `brew_update`** を呼んでいた。
`src/update/all.ts` の `OS_PACKAGES` は `paru` / `apt` / `brew` が PATH にあるかで
判定する。OS 名の対応表が要らず、paru と Homebrew が同居するマシンでは両方走る。

### 次の一歩

**shell の実装はもう無い。** `vup.sh` は `sudo -v` を取って `src/update/all.ts` に
渡すだけになった。

`mimikun/mimikun.sh` はアーカイブ済み。chezmoi の PowerShell プロファイルは本人が
改修中なので触らない。**残る葉は下の「chezmoi に残る16本」だけ。**

**着手前に、まず既存パッケージマネージャで済まないかを確認する**（上の節）。

**`vup --dry-run` が使えるようになった。** 何か変えたら、変更前後の出力を
`sed -E 's/^pueue add (--after [^-]*)?-- //' | sort` で正規化して diff する。
2026-08-03 の移管はこれで140タスク・依存41本の一致を確認した。

**2026-08-05 に点検済み。予定していた 2026-08-16 を前倒しした**（uv とパッケージリストを
触ったため）。146タスク・依存47本、cargo 25本、fish 補完 85本、`uv tool upgrade --all` 1本。
**落ちた分岐は無し。**

**OS パッケージの更新は stdout に出ない。** `paru -Syu` と `pez upgrade` は pueue に
積まず foreground で走らせるので、`--dry-run` では **stderr の `would run:`** に出る。
stdout だけを見て「積まれていない」と読むと、移管の事故と区別がつかなくなる
（実際に一度読み違えた）。stdout が pueue のコマンドだけなのは差分を取るための設計で、
これはその裏返し。

**chromedriver と Chrome は 151.0.7922.71 でパッチまで一致していた。** mise の `http:`
backend（`LATEST_RELEASE_STABLE`）で足りているので、`src/update/chromedriver.ts` は
書かなくてよい。**ずれた場合にだけ書く** — `google-chrome-stable --version` から
メジャーを取り、`LATEST_RELEASE_<major>` を引く形。

### chezmoi に残る16本 — うち移管対象は2本

長らく「18本」と書いていたが、実数は16本
（`private_dot_local/bin/` の `README.md` を除いた実行ファイル）。
**数え直すときは `grep -L "Thin shim"` で判定する。** シムはヘッダにその一行を持つ。

うち12本は移管対象ではない。**分類を先に済ませてあるので、次のセッションは
ここを読んで葉を選ぶこと。全部を「残っている shell」として数えないこと。**

- **上流のベンダーコピー（2本）** — `dotfyle`（271行）、`wsl-open`（227行、
  `gitlab.com/4U6U57/wsl-open`）。自作ではないので書き換える対象にしない
- **chezmoi 自身のフック（2本）** — `chezmoi_pre_apply_hook`（中身は
  `echo "THIS IS WIP"` だけ）、`chezmoi_post_apply_hook`（`aqua install --all`）。
  chezmoi が名前で探して呼ぶので、chezmoi 側にあることが動作条件
- **対話が本体の小物（8本）** — `cpat` `lk` `numeronym` `pcd` `read_confirm`
  `re_boot` `shut_down` `remove_neovim_data`。TTY を掴んで人に聞くのが仕事なので、
  pueue にも `--dry-run` にも乗らない。`all.ts` の `rebootCheck()` が `re_boot` を
  呼んでおり、この向き（TS → shell）で正しい

**移管対象は全部片付いた**（2026-08-03）。**この節に残っているのは分類だけ。**

**方針: python のアプリは `uv tool` に一本化した。** 更新は `all.ts` の
`SIMPLE` にある1行。経過:

- **pipx**（`dotfiles#3605`）— 42本のうち34本を `uv tool install --python 3.12`
  で移し、7本は既に uv 側にあったので pipx から外しただけ、`poetry` は捨てた。
  generate / install の表から `pipx` 行が消えたのはこの結果
- **pip**（`dotfiles#3606`）— `update_pip_packages` と
  `pueue_update_pip_packages` を削除。**同じ処理の2実装で、前者は `--after` で
  鎖にし後者は全部並列。** どちらも変数名は `pip_outdated_pkgs` だが中身は
  `pip freeze` なので outdated ではなく全件だった

**`uv tool list` は 26 → 108本。失敗0。**

### 906行の pip リストは、ほぼ依存だった

**`pip freeze` はアプリと依存を区別しない。** これが「pip に何が入っているか」を
読めなくしていた原因。**消す前に必ず分解すること。**

| 内訳 | 本数 |
|---|---|
| 推移的依存 | 811 |
| 根 — コマンドを持つ（アプリ） | 60 |
| 根 — コマンドを持たない（ライブラリ） | 36 |

**更新スクリプトが実際に守っていたのは60本のアプリだけ。** 47本を uv へ移し、
10本は uv に既にあったので pip の copy を消し、`pipx` は廃止、
`pbr`（ビルド依存が根に漏れたもの）と `aider-install`（本体は uv 側の
`aider-chat`）は据え置いた。

**pip のリストと install 経路は残っている。** あの環境には意図して入れた
ライブラリがまだある — `neovim`（pynvim、**Neovim の python provider**）、
`tree-sitter-*`、各種 SDK。**環境ごと作り直す案は取れない。**

### pipx と uv は同じ `~/.local/bin` を取り合う

`pipx uninstall` が、**uv が作った shim を持っていくこと**がある。
pipx 移管の直後は pip の copy が PATH の先で覆っていたので露出せず、
pip を消して初めて `asmdiff` と `prek` が消えているのが分かった。

**`uv tool list` が公開すると言っている entrypoint が `~/.local/bin` に
実在するかを照合すること。** venv の `bin/` を見てはいけない — 依存の
console script も入っており、uv はそれらを公開しない。復旧は
`uv tool install --force`（`--python` を付けて元のピンを保つ）。

### 孤児依存の掃除は1回では終わらない（2026-08-05 に完了）

58本のアプリを抜いた結果、その依存が孤児になった。**`pip uninstall` は依存を
連れて行かないので、消すたびに次の孤児が出る。**

**測り直しを繰り返す代わりに metadata グラフを歩く。** `src/misc/pip-roots.py` が
根（誰にも要求されていない＝自分で入れた物）を出すスクリプトで、これを
「keep 以外の根を落とす → 再計算」の形で収束するまで回した。5巡で126本、
849 → 723本。**何も消さずに最終形が出るので、消す前に全体を見て決められる。**

keep は移管前に控えた36本のライブラリ根 + 据え置き2本（`aider-install` / `pbr`）。
掃除後の根は38本ちょうどで、コマンドを持つのは据え置きの2本だけ。
**次の基準はこの38本。** 36本のリストは `pip-roots.py` を回せば再現できるので、
別に控えておく必要はもう無い。

**消えるコマンドは、消す前に PATH で数える。** 126本のうち26本が console script を
持ち、**代替の供給元がある物は1つも無かった**（`~/.local/bin` にも uv tool にも
同名が無い）。大半は `pymobiledevice3` の随伴 CLI で本体は uv tool 側にあるため
実害無しと判断できたが、**`yt-dlp` だけは pip が PATH 上の唯一の供給元だった** —
`ytm-player` が依存として引きずってきた物がたまたま表に出ていただけ。
`uv tool install yt-dlp` を先に済ませてから消した。

**使っているかどうかは fish の履歴で判定できる。** 26本すべて起動0件だった。
`grep -cE "^- cmd: (.*[|;&] *)?<name>( |$)" ~/.local/share/fish/fish_history` の形にする。
`grep -c "<name>"` では `paru -R yt-dlp` や nvim の `filetype` が混ざって嘘になる。

生成を `pip freeze` から `--not-required` へ切り替えるなら**掃除の後**。
先に切り替えると、根に化けた残骸をリストへ焼き付ける。

**葉は残っていない**（2026-08-05）。python 周りは pipx の廃止・pip の縮小・孤児の掃除・
uv の既定固定まで終わっている。次に触るとしたら、生成を `--not-required` へ切り替えるか、
3.10 が EOL を迎える 2026-10 に managed 3.10 を捨てるかのどちらか。

**`pip` は RTK に横取りされる。** `pip list --not-required` を Bash から叩くと
整形済みの要約が返り、行数を数えると嘘になる（214 を 1 と読んだ）。
**数える用途では `rtk proxy pip ...` を使う。** `src/**` の
`Bun.spawn(["pip", ...])` は hook を通らないので影響を受けない。

**移管の検証は、リストの件数ではなくエントリポイントで行う。**
パッケージ名と実行ファイル名は一致しない（`sherlock-project` → `sherlock`、
`a2a-handler` → `handler`、`toolong` → `tl`）ので、名前を数えても
「使えなくなったコマンド」は見つからない。pipx の移管では、先に
`pipx list --json` から60個のエントリポイントを控え、移管後に1件ずつ
PATH で引いた。59件一致し、残る `gptme-nc` は upstream が 0.32.1 で消したものだった。

### uv tool の python は、更新では要らず、入れ直しでだけ要る

**`uv tool upgrade --all` は `--python` を渡さなければ各ツールの既存インタプリタを
維持する。** 版は uv が `~/.local/share/uv/tools/<name>/pyvenv.cfg` に持っているので、
更新側はバージョンを1つも知らなくてよい。だから `src/update/uv-tools.ts` は無く、
`all.ts` の `SIMPLE` に1行あるだけ。**ここに表を作らないこと。**

**版が要るのは入れ直しだけ。** `uv tool install <name>` は uv の*既定*インタプリタで
建て直すので、名前だけのリストから復元すると全部そこへ着地する。
2026-08-03 時点でこのマシンの既定は managed 3.10（`uv python find` で確認できる）で、
実際のツールは 3.10 / 3.11 / 3.12 / 3.13 に散っていた。**穴はここだった。**

書式は `uv_tools.txt` の1行が `name` か `name 3.13`。**ファイルは版ごとに分けない。**

- ツールが 3.10 → 3.13 に動くと、分割では「削除＋追加」で2ファイルに跨る。
  1列なら1文字の編集で済み、git の diff で追える
- 3.10 は 2026-10 に EOL。版ごとのファイルはその都度の作成と削除を意味する
- 第2列が無い行は uv に選ばせるので、名前だけの旧リストがそのまま読める

**patch は書かない。** `3.10.19` と書くと uv の managed python がパッチを拾うたびに
全件入れ直しになる。互換の境界は minor。

書式を知っているのは `src/lib/uv.ts` だけ（`cargo.ts` と同じ役回り）。
生成もインストールもここを通す。

**散らばりは要件ではなく事故だった**（2026-08-05 に解消、`dotfiles#3612`）。
**uv は、誰も版を要求しないと自分が managed している install を選ぶ。**
このマシンではそれが 3.10 の1本だけだったので、明示せず入れたツールが全部そこへ
着地していた。**「動かないから 3.10」ではなく「入れた時の既定が 3.10 だった」。**

既定は `UV_PYTHON=3.12`（`config.fish.tmpl`）。3.10 の18本と 3.11 の2本を
`uv tool install --force --python 3.12` で入れ直し、103本が 3.12、6本が 3.13 になった。
**3.13 組は据え置き。** 下げても得るものが無く、壊すほうのリスクだけが残る。

- **`uv python find` は `UV_PYTHON` を見ない。** これで確認すると設定が効いていない
  ように見える。**確認は `uv venv` を作って `pyvenv.cfg` を読む**
- **プロジェクトの `.python-version` は `UV_PYTHON` より優先される**（実測）。
  つまりこの設定が効くのは版を指定しない install だけで、プロジェクト側は壊れない
- 入れ直しの検証は本数ではなく**公開コマンド**で行う。`uv tool list` の `- ` 行が
  `~/.local/bin` に実在するかを照合する（上の「pipx と uv は同じ `~/.local/bin` を
  取り合う」と同じ手順）

**`lk` は壊れている。** `cd "$(walk "$@")"` をスクリプトとして実行しているので、
cd が効くのは子プロセスだけ。`~/.config/fish/functions/` に同名の関数も無い。
直すなら移管ではなく fish 関数化。

**2026-08-03 に `update_brew` と `update_poetry` を削除した**（`dotfiles#3602`）。
前者は `all.ts` の `OS_PACKAGES` と完全に重複していて、しかも
`chezmoi add` 一覧に入っていなかった。後者は curl 版 poetry
（`~/.local/share/pypoetry`）を更新していたが、PATH に出ているのは mise の
python 3.12 側で、**使われていないコピーを更新していた。**

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
