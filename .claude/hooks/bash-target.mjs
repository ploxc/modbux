/**
 * A heredoc puts the bytes in `command`, where `file_path` and `new_string`
 * never look.
 *
 * Ported from `scripts/hooks/bash-target.ts` in the ploxc repo so the two stay
 * one rule. Every hook here that has to ask what a shell command is about to do
 * asks these three.
 */

/** Anchored, so a grep for `git commit` is not one. */
export const IS_COMMIT = /(?:^|[;&|]\s*|&&\s*|\|\|\s*)git\s+(?:commit|merge)\b/

/** Whitespace before the `>`, or `NF>4` and `-->` read as writes. */
export const WRITES_A_FILE = new RegExp(
  [
    '<<-?\\s*[\'"]?\\w', // heredoc
    '(?:^|[;&|]\\s*)sed\\s+(?:-[^\\s]+\\s+)*-i', // in-place sed
    '(?:^|[;&|]\\s*)tee\\b', // tee
    '(?:^|[\\s;&|])>>?\\s*(?!/dev/null)[.~$\\w/-]+' // redirect to a path
  ].join('|')
)

const PATH_TOKEN = /[\w./~-]*\.[A-Za-z]\w*/g

/** A glob names nothing rather than the wrong file. Reads and writes both. */
export function pathsIn(command) {
  const seen = new Set()
  for (const token of command.replace(/['"]/g, ' ').match(PATH_TOKEN) ?? []) {
    if (token.length > 0) seen.add(token)
  }
  return [...seen]
}
