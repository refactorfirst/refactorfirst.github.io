#!/bin/sh
# Process "Add repository" submission issues for GitHub, GitLab or Bitbucket.
#
# Usage: ci/process-submissions.sh <platform>
#   platform: github | gitlab | bitbucket
#
# For every open issue whose title is "Add repository: OWNER/REPO" the script:
#   1. extracts the submitter identity (the verified issue author),
#   2. validates that the submitter has write access to OWNER/REPO,
#   3. checks that .refactorfirst/refactor-first.json exists,
#   4. appends OWNER/REPO to repositories.txt and commits the change,
#   5. comments the outcome on the issue and closes it.
# Issues with a non-matching title are left untouched.
#
# Set DRY_RUN=1 to validate without committing, commenting or closing.
#
# Platform-specific environment (set by the pipeline):
#   github:    GH_TOKEN, GH_REPO (default: GITHUB_REPOSITORY),
#              ISSUE_NUMBER (process a single issue instead of polling)
#   gitlab:    CI_API_V4_URL, CI_PROJECT_ID, CI_DEFAULT_BRANCH,
#              GITLAB_TOKEN (falls back to CI_JOB_TOKEN), GITLAB_BASE
#   bitbucket: BITBUCKET_CLIENT_ID, BITBUCKET_CLIENT_SECRET,
#              BITBUCKET_REPO_FULL_NAME, BITBUCKET_BRANCH

set -u

PLATFORM="${1:-}"
REPORT_PATH=".refactorfirst/refactor-first.json"
TITLE_PREFIX="Add repository:"
NAME_RE='^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'

log() { echo "==> $*"; }

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v jq >/dev/null 2>&1 || fail "jq is required"

urlencode() { jq -rn --arg v "$1" '$v|@uri'; }

# ---------------------------------------------------------------------------
# Platform configuration
# ---------------------------------------------------------------------------

case "$PLATFORM" in
  github)
    GH_REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
    [ -n "${GH_TOKEN:-}" ] || fail "GH_TOKEN must be set"
    [ -n "$GH_REPO" ] || fail "GH_REPO (or GITHUB_REPOSITORY) must be set"
    GH_API="https://api.github.com"
    ;;
  gitlab)
    GITLAB_BASE="${GITLAB_BASE:-${CI_API_V4_URL%/api/v4}}"
    GITLAB_BASE="${GITLAB_BASE:-https://gitlab.com}"
    GITLAB_BASE="${GITLAB_BASE%/}"
    GL_API="${CI_API_V4_URL:-$GITLAB_BASE/api/v4}"
    [ -n "$GITLAB_BASE" ] || fail "GITLAB_BASE could not be derived"
    [ -n "${GITLAB_TOKEN:-}" ] && AUTH_HEADER="PRIVATE-TOKEN: $GITLAB_TOKEN" \
      || AUTH_HEADER="JOB-TOKEN: ${CI_JOB_TOKEN:?set GITLAB_TOKEN or run in a GitLab pipeline}"
    [ -n "${CI_PROJECT_ID:-}" ] || fail "CI_PROJECT_ID must be set"
    ;;
  bitbucket)
    BB_API="https://api.bitbucket.org/2.0"
    [ -n "${BITBUCKET_CLIENT_ID:-}" ] || fail "BITBUCKET_CLIENT_ID must be set"
    [ -n "${BITBUCKET_CLIENT_SECRET:-}" ] || fail "BITBUCKET_CLIENT_SECRET must be set"
    [ -n "${BITBUCKET_REPO_FULL_NAME:-}" ] || fail "BITBUCKET_REPO_FULL_NAME must be set"
    ;;
  *)
    fail "usage: $0 <github|gitlab|bitbucket>"
    ;;
esac

DRY_RUN="${DRY_RUN:-}"

bitbucket_token() {
  [ -n "${BB_TOKEN:-}" ] && { echo "$BB_TOKEN"; return; }
  BB_TOKEN=$(curl -sf -u "$BITBUCKET_CLIENT_ID:$BITBUCKET_CLIENT_SECRET" \
    -d grant_type=client_credentials \
    https://bitbucket.org/site/oauth2/access_token | jq -r '.access_token') \
    || fail "Bitbucket token request failed"
  echo "$BB_TOKEN"
}

# curl wrapper with the platform's auth applied.
api_get() { # url
  case "$PLATFORM" in
    github)    curl -sf -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "$1" ;;
    gitlab)    curl -sf -H "$AUTH_HEADER" "$1" ;;
    bitbucket) curl -sf -H "Authorization: Bearer $(bitbucket_token)" "$1" ;;
  esac
}

api_post() { # url payload
  case "$PLATFORM" in
    github)    curl -sf -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" -d "$2" "$1" ;;
    gitlab)    curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" -d "$2" "$1" ;;
    bitbucket) curl -sf -X POST -H "Authorization: Bearer $(bitbucket_token)" -H "Content-Type: application/json" -d "$2" "$1" ;;
  esac
}

# ---------------------------------------------------------------------------
# Issue enumeration
# ---------------------------------------------------------------------------

# Emit one tab-separated record "id<tab>title<tab>author" per submission issue.
list_submission_issues() {
  case "$PLATFORM" in
    github)
      if [ -n "${ISSUE_NUMBER:-}" ]; then
        api_get "$GH_API/repos/$GH_REPO/issues/$ISSUE_NUMBER" \
          | jq -r '[.number, .title, .user.login] | @tsv'
      else
        api_get "$GH_API/repos/$GH_REPO/issues?state=open&per_page=100" \
          | jq -r --arg p "$TITLE_PREFIX" '.[]
              | select(.title | startswith($p))
              | select(has("pull_request") | not)
              | [.number, .title, .user.login] | @tsv'
      fi
      ;;
    gitlab)
      api_get "$GL_API/projects/$CI_PROJECT_ID/issues?state=opened&per_page=100" \
        | jq -r --arg p "$TITLE_PREFIX" '.[]
            | select(.title | startswith($p))
            | [.iid, .title, .author.username] | @tsv'
      ;;
    bitbucket)
      api_get "$BB_API/repositories/$BITBUCKET_REPO_FULL_NAME/issues?state=new&pagelen=100" \
        | jq -r --arg p "$TITLE_PREFIX" '.values[]
            | select(.title | startswith($p))
            | [.id, .title, .reporter.uuid] | @tsv'
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

# Echo the repository's default branch.
repo_default_branch() { # owner repo
  case "$PLATFORM" in
    github)
      api_get "$GH_API/repos/$1/$2" | jq -r '.default_branch // "main"' ;;
    gitlab)
      api_get "$GL_API/projects/$(urlencode "$1/$2")" | jq -r '.default_branch // "main"' ;;
    bitbucket)
      api_get "$BB_API/repositories/$1/$2" | jq -r '.mainbranch.name // "main"' ;;
  esac
}

# Verify the submitter has write access to owner/repo (0 = allowed).
check_access() { # owner repo submitter
  RO="$1"; RR="$2"; SUBMITTER="$3"
  case "$PLATFORM" in
    github)
      # The permission endpoint resolves owners, org members and
      # collaborators to a concrete permission level.
      perm=$(api_get "$GH_API/repos/$RO/$RR/collaborators/$SUBMITTER/permission" \
        | jq -r '.permission // empty') || return 1
      [ "$perm" = "write" ] || [ "$perm" = "admin" ]
      ;;
    gitlab)
      uid=$(api_get "$GITLAB_BASE/api/v4/users?username=$SUBMITTER" | jq -r '.[0].id // empty')
      [ -n "$uid" ] || return 1
      level=$(api_get "$GL_API/projects/$(urlencode "$RO/$RR")/members/all/$uid" \
        | jq -r '.access_level // 0') || return 1
      [ "$level" -ge 30 ] 2>/dev/null # Developer (30) or higher grants write
      ;;
    bitbucket)
      api_get "$BB_API/repositories/$RO/$RR/permissions-config/users/$SUBMITTER" \
        | jq -re 'select(.permission == "write" or .permission == "admin")' >/dev/null
      ;;
  esac
}

# HEAD-check the report file across candidate branches (0 = found).
report_file_exists() { # owner repo
  OWNER="$1"; REPO="$2"
  SEEN_BRANCHES=""
  DEFAULT_BRANCH=$(repo_default_branch "$OWNER" "$REPO") || DEFAULT_BRANCH="main"
  raw_url() {
    case "$PLATFORM" in
      github)    echo "https://raw.githubusercontent.com/$OWNER/$REPO/$1/$REPORT_PATH" ;;
      gitlab)    echo "$GITLAB_BASE/$OWNER/$REPO/-/raw/$1/$REPORT_PATH" ;;
      bitbucket) echo "https://bitbucket.org/$OWNER/$REPO/raw/$1/$REPORT_PATH" ;;
    esac
  }
  for BRANCH in main "$DEFAULT_BRANCH" master; do
    # Deduplicate branch candidates
    case " ${SEEN_BRANCHES:-} " in *" $BRANCH "*) continue ;; esac
    SEEN_BRANCHES="${SEEN_BRANCHES:-} $BRANCH"
    code=$(curl -sI -o /dev/null -w '%{http_code}' \
      --connect-timeout 10 --max-time 30 "$(raw_url "$BRANCH")")
    [ "$code" = "200" ] && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# Write-back: repositories.txt, commit, comment, close
# ---------------------------------------------------------------------------

# Add the full name to repositories.txt (sorted, unique). 0 = added.
add_to_listing() { # full_name
  if grep -Fxq -- "$1" repositories.txt; then
    return 1
  fi
  [ -n "$DRY_RUN" ] && { log "DRY_RUN: would add '$1' to repositories.txt"; return 0; }
  echo "$1" >> repositories.txt
  sort -o repositories.txt repositories.txt
  awk '!seen[$0]++' repositories.txt > repositories.txt.tmp
  mv repositories.txt.tmp repositories.txt
  return 0
}

commit_listing() { # full_name submitter
  MSG="Add repository: $1 (submitted by $2)"
  [ -n "$DRY_RUN" ] && { log "DRY_RUN: would commit: $MSG"; return 0; }
  case "$PLATFORM" in
    github)
      git config user.name "github-actions[bot]"
      git config user.email "github-actions[bot]@users.noreply.github.com"
      git add repositories.txt
      git diff --staged --quiet || git commit -m "$MSG"
      git push
      ;;
    gitlab)
      curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
        "$GL_API/projects/$CI_PROJECT_ID/repository/commits" \
        --data-binary "$(jq -n --arg branch "${CI_DEFAULT_BRANCH:-main}" \
          --arg msg "$MSG" --rawfile content repositories.txt \
          '{branch: $branch, commit_message: $msg,
            actions: [{action: "update", file_path: "repositories.txt", content: $content}]}')"
      ;;
    bitbucket)
      curl -sf -X POST -H "Authorization: Bearer $(bitbucket_token)" \
        "$BB_API/repositories/$BITBUCKET_REPO_FULL_NAME/src" \
        -F "files=repositories.txt" -F "repositories.txt=@repositories.txt" \
        -F "message=$MSG" -F "branch=${BITBUCKET_BRANCH:-main}"
      ;;
  esac
}

comment_issue() { # issue_id message
  [ -n "$DRY_RUN" ] && { log "DRY_RUN: comment on #$1: $2"; return 0; }
  case "$PLATFORM" in
    github)
      api_post "$GH_API/repos/$GH_REPO/issues/$1/comments" \
        "$(jq -n --arg body "$2" '{body: $body}')" ;;
    gitlab)
      api_post "$GL_API/projects/$CI_PROJECT_ID/issues/$1/notes" \
        "$(jq -n --arg body "$2" '{body: $body}')" ;;
    bitbucket)
      api_post "$BB_API/repositories/$BITBUCKET_REPO_FULL_NAME/issues/$1/comments" \
        "$(jq -n --arg body "$2" '{content: {raw: $body}}')" ;;
  esac
}

close_issue() { # issue_id
  [ -n "$DRY_RUN" ] && { log "DRY_RUN: close #$1"; return 0; }
  case "$PLATFORM" in
    github)
      curl -sf -X PATCH -H "Authorization: Bearer $GH_TOKEN" \
        -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" \
        -d '{"state":"closed"}' "$GH_API/repos/$GH_REPO/issues/$1" >/dev/null ;;
    gitlab)
      curl -sf -X PUT -H "$AUTH_HEADER" -H "Content-Type: application/json" \
        -d '{"state_event":"close"}' "$GL_API/projects/$CI_PROJECT_ID/issues/$1" ;;
    bitbucket)
      curl -sf -X PUT -H "Authorization: Bearer $(bitbucket_token)" \
        -H "Content-Type: application/json" -d '{"state":"resolved"}' \
        "$BB_API/repositories/$BITBUCKET_REPO_FULL_NAME/issues/$1" ;;
  esac
}

# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

process_issue() { # issue_id title author
  ISSUE_ID="$1"; TITLE="$2"; AUTHOR="$3"
  case "$TITLE" in
    "$TITLE_PREFIX "*) ;;
    *) log "Issue #$ISSUE_ID is not a submission (title: $TITLE) — skipping"; return ;;
  esac
  REPO_PATH="${TITLE#"$TITLE_PREFIX" }"

  log "Issue #$ISSUE_ID by @$AUTHOR: $TITLE"

  OWNER="${REPO_PATH%%/*}"; REPO="${REPO_PATH#*/}"
  if [ "$OWNER" = "$REPO_PATH" ] || [ -z "$OWNER" ] || [ -z "$REPO" ] || \
     ! echo "$OWNER" | grep -Eq "$NAME_RE" || ! echo "$REPO" | grep -Eq "$NAME_RE"; then
    comment_issue "$ISSUE_ID" "Could not parse the repository name from the issue title. Please use the exact format: \`$TITLE_PREFIX owner/repository\`."
    close_issue "$ISSUE_ID"
    return
  fi

  if grep -Fxq -- "$OWNER/$REPO" repositories.txt; then
    comment_issue "$ISSUE_ID" "\`$OWNER/$REPO\` is already in the listing."
    close_issue "$ISSUE_ID"
    return
  fi

  if ! check_access "$OWNER" "$REPO" "$AUTHOR"; then
    comment_issue "$ISSUE_ID" "@$AUTHOR does not have write access to \`$OWNER/$REPO\` — submissions are only accepted from maintainers."
    close_issue "$ISSUE_ID"
    return
  fi

  if ! report_file_exists "$OWNER" "$REPO"; then
    comment_issue "$ISSUE_ID" "No \`$REPORT_PATH\` file found on \`$OWNER/$REPO\` (checked main, default branch and master). Add a RefactorFirst report CI job first (see the Getting Started page)."
    close_issue "$ISSUE_ID"
    return
  fi

  if add_to_listing "$OWNER/$REPO"; then
    if commit_listing "$OWNER/$REPO" "$AUTHOR"; then
      comment_issue "$ISSUE_ID" "Added \`$OWNER/$REPO\` to the listing (submitted by @$AUTHOR). It will appear after the next site deployment."
    else
      comment_issue "$ISSUE_ID" "Validation succeeded, but committing the listing failed. A maintainer will retry."
    fi
  else
    comment_issue "$ISSUE_ID" "\`$OWNER/$REPO\` was added to the listing by another in-flight submission."
  fi
  close_issue "$ISSUE_ID"
}

log "Processing submissions on $PLATFORM"
list_submission_issues | while IFS="$(printf '\t')" read -r ID TITLE AUTHOR; do
  [ -n "$ID" ] || continue
  process_issue "$ID" "$TITLE" "$AUTHOR"
done
log "Done."
