# What `git add -A` took

**A build artefact rode into a commit on this branch.** `tsconfig.node.tsbuildinfo`
is written by `tsc --composite` and had never been tracked. It went in because
the commit was staged with `git add -A` and the status was not read first.

```sh
git ls-tree main --name-only | grep tsbuildinfo   # nothing: it was never on main
grep -n tsbuildinfo .gitignore                    # nothing: it was not ignored either
```

Two things had to be false at once for it to land, and both were: it was not in
`.gitignore`, and nobody looked at what was being staged. `.gitignore` now
carries `*.tsbuildinfo`.

**Nothing failed.** Lint, typecheck and the suite all passed with it in the tree,
because it is not code. It was caught while consolidating branches, one commit
later, by reading a file list for a different reason.

The rule is not "never use `-A`". It is that `git status --porcelain` is read
first, every time, and that a name in it you did not expect gets answered before
it is staged.
