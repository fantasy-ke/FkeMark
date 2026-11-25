#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export PATH="$tmp:$PATH" BASH_ENV="$root/scripts/retry-dmg-detach.sh" CALLS="$tmp/calls" WAITED="$tmp/waited"

cat > "$tmp/hdiutil" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALLS"
case $MODE in
  recover) [[ -e $WAITED ]] && exit 0 ;;
  fatal) echo 'hdiutil: detach: no such device' >&2; exit 7 ;;
esac
printf '%s\n' "hdiutil: couldn't eject \"disk2\" - Resource busy" >&2
exit 2
SH
cat > "$tmp/sleep" <<'SH'
#!/usr/bin/env bash
touch "$WAITED"
SH
printf '%s\n' 'hdiutil "$@"' > "$tmp/bundle_dmg.sh"
cp "$tmp/bundle_dmg.sh" "$tmp/other.sh"
chmod +x "$tmp/hdiutil" "$tmp/sleep"

check() {
  local mode=$1 script=$2 verb=$3 want_status=$4 want_calls=$5 status=0
  : > "$CALLS"
  MODE=$mode bash "$tmp/$script" "$verb" /dev/disk2 > "$tmp/output" 2>&1 || status=$?
  rm -f "$WAITED"
  if [[ $status != "$want_status" || $(wc -l < "$CALLS") -ne $want_calls ]] ||
    grep -qvxF "$verb /dev/disk2" "$CALLS"; then
    printf 'FAIL %s/%s/%s: status %s (expected %s), calls:\n' "$mode" "$script" "$verb" "$status" "$want_status" >&2
    cat "$CALLS" "$tmp/output" >&2
    exit 1
  fi
  printf 'PASS %s/%s/%s\n' "$mode" "$script" "$verb"
}

check recover bundle_dmg.sh detach 0 2
check busy bundle_dmg.sh detach 2 2
check fatal bundle_dmg.sh detach 7 1
check recover bundle_dmg.sh attach 2 1
check recover other.sh detach 2 1
