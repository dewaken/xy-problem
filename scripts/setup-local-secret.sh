#!/bin/bash
set -eu
umask 077
printf 'TypeSafe APIキーを入力してください（入力内容は表示されません）: '
IFS= read -r -s api_key
printf '\n'
if [ -z "$api_key" ]; then
  printf 'APIキーが空のため、保存しませんでした。\n' >&2
  exit 1
fi
printf 'JEV_API_KEY=%s\n' "$api_key" > .dev.vars
unset api_key
printf '.dev.vars に保存しました。Gitには登録されません。\n'
