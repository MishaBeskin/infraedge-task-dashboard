Check git status, run lint and tests, then commit and push with a conventional commit message.

## Steps

1. Run `git status` and `git diff` (staged + unstaged) to see the full changeset
2. Run `npm run lint` — if it fails, stop and report the errors, do not commit
3. Run `npx vitest run` — if it fails, stop and report the failures, do not commit
4. Stage the files the user intends to commit (ask if it's unclear which ones)
5. Generate a conventional commit message based on the changes:
   - `feat:` new feature
   - `fix:` bug fix
   - `chore:` maintenance, tooling, config, dependencies
   - `refactor:` code restructure without feature or bug change
   - `style:` formatting, whitespace, CSS
   - `docs:` documentation only
   - `test:` adding or fixing tests
   - `perf:` performance improvement
6. Commit using a heredoc with the Co-Authored-By trailer
7. Run `git push`
8. Report the commit hash and branch that was pushed
