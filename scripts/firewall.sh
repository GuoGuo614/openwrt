#!/bin/sh

set -eu

ACTION="${1:-}"

case "$ACTION" in
  add)
    echo "TODO: add firewall rule"
    echo "args: $*"
    ;;
  list)
    echo "TODO: list experiment firewall rules"
    ;;
  delete)
    echo "TODO: delete firewall rule"
    echo "args: $*"
    ;;
  clear)
    echo "TODO: clear experiment firewall rules"
    ;;
  *)
    echo "usage: $0 {add|list|delete|clear} ..." >&2
    exit 2
    ;;
esac

