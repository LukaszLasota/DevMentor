#!/usr/bin/env bash
# PreToolUse hook for the Bash tool (wired in .claude/settings.json).
#
# Claude Code passes the tool call as JSON on stdin; the exit code decides:
#   0 - the command runs,
#   2 - the command is blocked and stderr goes to the model as the reason.
# Any other code is a hook error and the command RUNS, so this script never
# exits with anything but 0 or 2: a missing jq or unparsable input blocks
# (fail closed).
#
# Blocked:
#   1. Pipe-to-shell: curl/wget output piped into a shell or interpreter
#      (`curl … | sh`, `wget -O- … | bash`, `sh <(curl …)`, `bash -c "$(curl …)"`).
#   2. Recursive delete (`rm -r/-R/-rf/-fr/--recursive`) unless every target is a
#      build artefact (a path whose last segment is node_modules, .next, coverage,
#      dist or storybook-static, without `..`, `$` or backticks) or lies under /tmp/
#      (the agent scratchpad lives there). A recursive rm without targets on the
#      command line (`xargs rm -rf`) is blocked: its targets are unknown. `git rm -r`
#      and similar subcommands pass. Any `rm` word counts, so `echo rm -rf x` blocks too.
#   3. Credential locations by any prefix (~, $HOME, ${HOME}, /home/<user>, /root,
#      relative): .ssh, .aws, .config/gh, .qodo, .kube, .gnupg, .claude/projects,
#      and ~/.npmrc, ~/.pypirc.
#   4. Any mention of a dotenv file (.env, .env.local, .env.*, .envrc, …) except
#      .env.example and .env.template, whatever command reads it.
#
# Known gaps (pass this hook; the sandbox `filesystem.denyRead` and the
# `permissions.deny` rules are the real boundary, this hook is a tripwire):
#   - obfuscated names: quotes or escapes inside a name (`cat .e''nv`, `cat .e\nv`),
#     globs (`cat .en?`, `cat .e*v`), `$(printf '\x2eenv')`, base64-decoded commands,
#     names assembled in variables (`f=.en; cat ${f}v`);
#   - files read by a program without naming them on the command line
#     (`node scripts/x.mjs`, `grep -r SECRET .`, `find . -name '*nv' -exec cat {} +`);
#   - deletes without `rm -r`: `find … -delete`, `git clean -fdx`, `rsync --delete`,
#     `rm` of a glob that the shell expands to many files, language one-liners;
#   - pipe-to-shell through other downloaders (`python -c urllib…`, `node -e fetch…`)
#     or through an intermediate file (`curl -o x.sh … && sh x.sh`);
#   - credential stores not listed above (e.g. ~/.docker/config.json);
#   - other tools: the hook only sees Bash calls (matcher "Bash"), Read/Edit are
#     covered by `permissions.deny`.
# Tests: scripts/hooks/pre-tool-use.test.mjs (part of `npm run test:coverage`).

block() {
  printf 'Blocked by the DevMentor agent policy (.claude/hooks/pre-tool-use.sh): %s. Do not try to work around this block with another command; ask the user if the action is really needed.\n' "$1" >&2
  exit 2
}

if ! command -v jq >/dev/null 2>&1; then
  block "jq is not installed, so the hook cannot inspect the command (install jq to run Bash commands)"
fi

# Builtin read: /dev/stdin fails on socket stdin, and cat is one more binary that could be missing.
IFS= read -r -d "" input || true
cmd=$(printf '%s' "$input" | jq -er '.tool_input.command | if type == "string" then . else error("no command") end' 2>/dev/null) ||
  block "the hook input is not valid JSON with a string tool_input.command"

# Regexes live in variables: bash parses `<`, `(` and `|` inside [[ ]] itself.
# Bracket expressions keep them literal under any ERE flavour.
start='(^|[^[:alnum:]_.-])'
end='([^[:alnum:]_.-]|$)'
fetch="(curl|wget)$end"
interp='(sudo[[:space:]]+)?(env[[:space:]]+)?([^[:space:]|;&]*/)?((ba|da|k|z|fi)?sh|python[0-9.]*|node|perl|ruby)'

# 1. Pipe-to-shell.
pipe_to_shell="$start$fetch.*[|][[:space:]]*$interp$end"
process_substitution="[<][(][[:space:]]*$fetch"
command_substitution="[\$][(][[:space:]]*$fetch"
backticks="[\`][[:space:]]*$fetch"
if [[ $cmd =~ $pipe_to_shell || $cmd =~ $process_substitution || $cmd =~ $command_substitution || $cmd =~ $backticks ]]; then
  block "piping a downloaded script into a shell or interpreter"
fi

# 2. Recursive delete outside build artefacts.
parent_segment='(^|/)[.][.](/|$)'
tmp_child='^/tmp/[[:alnum:]_.-]+(/|$)'
safe_rm_target() {
  local t=$1
  t=${t//\"/}
  t=${t//\'/}
  while [[ $t == */ && $t != / ]]; do t=${t%/}; done
  [[ -z $t || $t == *'$'* || $t == *'`'* || $t =~ $parent_segment ]] && return 1
  [[ $t =~ $tmp_child ]] && return 0
  case "${t##*/}" in
    node_modules | .next | coverage | dist | storybook-static) return 0 ;;
  esac
  return 1
}

segments=$cmd
for sep in '&&' '||' ';' '|' '&' '(' ')' '`'; do
  segments=${segments//"$sep"/$'\n'}
done
set -f
while IFS= read -r segment; do
  read -ra tokens <<<"$segment"
  for ((i = 0; i < ${#tokens[@]}; i++)); do
    word=${tokens[i]//\"/}
    word=${word//\'/}
    word=${word#\\}
    [[ ${word##*/} == rm ]] || continue
    if ((i > 0)); then
      case "${tokens[i - 1]}" in
        git | npm | pnpm | yarn | docker | podman | kubectl | helm | brew | cargo | gh) continue ;;
      esac
    fi
    recursive=0
    unsafe=0
    targets=0
    options_done=0
    for ((j = i + 1; j < ${#tokens[@]}; j++)); do
      arg=${tokens[j]}
      if ((!options_done)) && [[ $arg == -* ]]; then
        case "$arg" in
          --) options_done=1 ;;
          --recursive) recursive=1 ;;
          --*) ;;
          *[rR]*) recursive=1 ;;
        esac
        continue
      fi
      targets=$((targets + 1))
      safe_rm_target "$arg" || unsafe=1
    done
    # No target on the command line means the targets come from elsewhere (xargs): unknown, so unsafe.
    if ((recursive && (unsafe || targets == 0))); then
      block "recursive delete (rm -r) outside build artefacts (node_modules, .next, coverage, dist, storybook-static, /tmp/...)"
    fi
    break
  done
done <<<"$segments"
set +f

# 3. Credential locations.
credential_dir="$start[.](ssh|aws|qodo|kube|gnupg|config/gh|claude/projects)$end"
credential_file="(~|[\$]HOME|[\$][{]HOME[}]|/home/[^/[:space:]]+|/root)/[.](npmrc|pypirc)$end"
if [[ $cmd =~ $credential_dir || $cmd =~ $credential_file ]]; then
  block "access to credential files (SSH keys, cloud and GitHub tokens, Qodo key, agent session history)"
fi

# 4. Dotenv files other than the committed templates.
rest=$cmd
dotenv='(^|[^[:alnum:]_])([.]env[[:alnum:]_.*?-]*)'
while [[ $rest =~ $dotenv ]]; do
  case "${BASH_REMATCH[2]}" in
    .env.example | .env.template) ;;
    *) block "reading or writing a .env file (only .env.example and .env.template are allowed)" ;;
  esac
  rest=${rest#*"${BASH_REMATCH[0]}"}
done

exit 0
