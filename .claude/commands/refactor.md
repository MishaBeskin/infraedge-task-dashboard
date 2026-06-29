Refactor the current file for readability and maintainability without changing behavior.

## Steps

1. Ask the user which file to refactor if not already clear from context
2. Read the full file
3. Identify improvements:
   - Extract repeated logic into helper functions
   - Rename variables/functions that don't clearly describe what they do
   - Simplify deeply nested conditionals (early returns, guard clauses)
   - Break long functions into smaller focused ones (single responsibility)
   - Replace `any` types with specific TypeScript types
   - Remove dead code and unused variables
   - Consolidate duplicate Supabase queries
4. Apply the refactoring — preserve all existing behavior exactly
5. Run `npm run lint` after editing and fix any new lint errors
6. Summarize what changed and why (not what the code does — what was improved)

## Constraints

- Do NOT change behavior — same inputs must produce same outputs
- Do NOT add new features or error handling that wasn't there before
- Do NOT change the public API (exported function signatures, component props)
- Keep all Hebrew text and RTL attributes intact
