Scan the whole project for lint errors, TypeScript errors, and code quality issues, then fix them all.

## Steps

1. Run `npm run lint` and capture the output — list every error and warning
2. Run `npx tsc --noEmit` and capture TypeScript errors
3. Search the codebase for:
   - `console.log` calls (not `console.error`) — remove or replace
   - `any` type annotations — replace with specific types or `unknown`
   - Unused imports — remove them
   - Directional Tailwind classes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`) — replace with logical equivalents (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)
4. Fix all issues found, file by file
5. Re-run `npm run lint` and `npx tsc --noEmit` to verify zero errors remain
6. Report a summary: how many issues were found and fixed in each category

## Priority order

1. TypeScript errors (break the build)
2. ESLint errors (will fail CI)
3. `console.log` calls (noisy in production)
4. `any` types (type safety holes)
5. Unused imports (dead code)
6. Directional CSS classes (RTL bugs)
