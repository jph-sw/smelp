#!/usr/bin/env bash
# Usage:
#   pr-index.sh                 Index recent PRs by the SMELP keys they mention.
#   pr-index.sh 83 84 ...       Show the state of specific PRs.
# Env: SMELP_PR_LIMIT (default 200), SMELP_KEY_PREFIX (default SMELP).
set -euo pipefail

prefix="${SMELP_KEY_PREFIX:-SMELP}"
fields=number,title,state,mergedAt,closedAt,headRefName,baseRefName,url,body

if [ "$#" -gt 0 ]; then
  for n in "$@"; do
    gh pr view "$n" --json "$fields" \
      | jq -c '{number, title, state, mergedAt, headRefName, baseRefName, url}'
  done
  exit 0
fi

gh pr list --state all --limit "${SMELP_PR_LIMIT:-200}" --json "$fields" \
  | jq --arg p "$prefix" '
      def keys_in($s): [($s // "") | scan("(?i)\\b" + $p + "-[0-9]+\\b") | ascii_upcase];
      [ .[]
        | . as $pr
        | (keys_in(.title) | map({key: ., via: "title"}))
          + (keys_in(.headRefName) | map({key: ., via: "branch"}))
          + (keys_in(.body) | map({key: ., via: "body"}))
        | unique_by(.key + .via)
        | .[]
        | {key, via, number: $pr.number, state: $pr.state, mergedAt: $pr.mergedAt,
           baseRefName: $pr.baseRefName, title: $pr.title, url: $pr.url} ]
      | group_by(.key)
      | map({key: .[0].key,
             prs: (group_by(.number) | map(.[0] + {via: (map(.via) | join(","))} | del(.key)))})
      | sort_by(.key | ltrimstr($p + "-") | tonumber)'
