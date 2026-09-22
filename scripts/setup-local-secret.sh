#!/bin/bash
set -eu
umask 077
key_file="$HOME/.config/typesafe/env"
printf 'TypeSafe APIキーを入力してください（入力内容は表示されません）: '
IFS= read -r -s api_key
printf '\n'
if [ -z "$api_key" ]; then
  printf 'APIキーが空のため、保存しませんでした。\n' >&2
  exit 1
fi
mkdir -p "$(dirname "$key_file")"
tmp_file="$(mktemp "$key_file.XXXXXX")"
# 他の変数は残し、TYPESAFE_API_KEY の行だけを差し替える
if [ -f "$key_file" ]; then grep -v '^TYPESAFE_API_KEY=' "$key_file" > "$tmp_file" || true; fi
printf 'TYPESAFE_API_KEY=%s\n' "$api_key" >> "$tmp_file"
unset api_key
mv "$tmp_file" "$key_file"
chmod 600 "$key_file"
printf '%s に保存しました。リポジトリの外なので Git には登録されません。\n' "$key_file"
