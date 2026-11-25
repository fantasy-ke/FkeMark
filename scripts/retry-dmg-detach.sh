#!/usr/bin/env bash

# 仅延长 Tauri 临时 DMG 的卸载等待；不拦截其他脚本或 hdiutil 子命令。
if [[ ${0##*/} == bundle_dmg.sh ]]; then
  hdiutil() {
    if [[ ${1-} != detach ]]; then
      command hdiutil "$@"
      return
    fi

    local output status
    if output=$(command hdiutil "$@" 2>&1); then
      printf '%s\n' "$output"
      return
    else
      status=$?
    fi

    printf '%s\n' "$output" >&2
    if [[ $output != *'Resource busy'* ]]; then
      return "$status"
    fi

    sleep 10
    command hdiutil "$@"
  }
fi
