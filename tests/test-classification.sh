#!/bin/sh
# Tests the Stop hook's task-complete / decision-needed classification.
#
#   sh tests/test-classification.sh
#
# Runs anywhere with a POSIX sh - macOS, Linux, or Git Bash on Windows. It
# plays no audio and touches nothing outside this script.
#
# Why this exists: the Windows hook anchors its regex at end-of-string with
# .NET's `-match`. `grep` anchors at the end of every line, so translating the
# regex literally would fire decision-needed for any multi-line answer that
# merely mentions a question - which is most of them. The logic below compares
# only the last non-empty line, and the MULTI-LINE cases are the regression
# guard for exactly that.
#
# Keep in step with hooks/play-sound.sh. If the classification there changes,
# change it here.

classify() {
    msg="$1"
    category=task-complete
    if [ -n "$msg" ]; then
        tail_line=$(printf '%s\n' "$msg" | sed -e 's/[[:space:]]*$//' -e '/^$/d' | tail -n 1)
        case "$tail_line" in
            *\?)
                category=decision-needed
                ;;
            *)
                if printf '%s' "$tail_line" | grep -qE '\?[^[:alnum:]]*$'; then
                    category=decision-needed
                fi
                ;;
        esac
    fi
    printf '%s' "$category"
}

pass=0
fail=0

check() {
    want="$1"; desc="$2"; msg="$3"
    got=$(classify "$msg")
    if [ "$got" = "$want" ]; then
        pass=$((pass + 1))
        printf '  ok    %-56s -> %s\n' "$desc" "$got"
    else
        fail=$((fail + 1))
        printf '  FAIL  %-56s -> %s (wanted %s)\n' "$desc" "$got" "$want"
    fi
}

printf '\nStop hook classification\n\n'

check task-complete   "empty message"                   ""
check task-complete   "plain statement"                 "Done."
check task-complete   "statement ending in punctuation" "That failed."
check task-complete   "ends with exclamation"           "All set!"

check decision-needed "single-line question"            "Should I keep going?"
check decision-needed "question with trailing quote"    'Is that right?"'
check decision-needed "question then closing paren"     "Shall I continue (or stop)?"
check decision-needed "question, trailing whitespace"   "Want me to proceed?   "
check decision-needed "question mark then period"       "Which one?."
check decision-needed "question, then blank lines"      "$(printf 'Ready to deploy?\n\n\n')"

printf '\n  multi-line - the reason this file exists\n\n'

check task-complete   "question first, statement last" \
    "$(printf 'You asked whether this should be configurable?\nHere is the answer. I made it configurable and all tests pass.')"

check decision-needed "statement first, question last" \
    "$(printf 'I refactored the installer and the tests pass.\nWant me to commit it?')"

check task-complete   "code block containing a question mark" \
    "$(printf 'Added the guard:\n\n    if [ -z "$x" ]; then exit 0; fi\n\nAll set.')"

printf '\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
