Review the current git diff for quality issues.

## Steps

1. Run `git diff HEAD` to see all uncommitted changes (staged + unstaged)
2. If no uncommitted changes, run `git diff HEAD~1` to review the last commit
3. Review each changed file for:
   - **Bugs**: logic errors, off-by-one errors, wrong conditions
   - **Edge cases**: empty inputs, null/undefined, empty arrays, long strings
   - **Missing error handling**: unhandled promise rejections, missing try/catch around external calls (Supabase, Jina API)
   - **TypeScript issues**: unsafe `any` types, missing null checks, incorrect types
   - **Code smells**: duplicated logic, overly complex functions, poor naming
   - **Security**: SQL injection (use parameterized queries), XSS, exposed secrets
   - **RTL/Hebrew**: hardcoded LTR text direction, directional Tailwind classes (`ml-`, `mr-`) instead of logical ones (`ms-`, `me-`)
   - **RAG rules**: any code that might generate or infer answers instead of returning stored Q&A verbatim
4. Report findings grouped by severity: **Critical**, **Warning**, **Suggestion**
5. For each finding, include the file name, line number (if available), and a one-line fix recommendation
