Generate a pull request description from the current branch's changes.

## Steps

1. Run `git log main..HEAD --oneline` to list all commits on this branch
2. Run `git diff main...HEAD` to see the full changeset
3. Identify:
   - What changed (files, features, fixes)
   - Why it changed (bug, user request, performance, etc.)
   - Any risks or side effects (DB schema changes, API changes, env var changes)
4. Write a PR description with these sections:

---

## Summary

- [Bullet list of changes, 2-5 items]

## Why

[One paragraph: what problem this solves or what feature it adds]

## Changes

| File | What changed |
|---|---|
| `src/...` | [one line] |

## Testing

- [ ] Tested in local dev
- [ ] Checked on mobile / RTL layout
- [ ] Admin Q&A CRUD still works
- [ ] Chat returns correct answers for known questions
- [ ] Chat returns Hebrew fallback for unknown questions

## Env vars / migrations

[List any new environment variables or Supabase migrations required, or "None"]

---

5. Print the description to the screen — do NOT create a GitHub PR automatically unless the user explicitly asks
