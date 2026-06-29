Find untested functions and generate Vitest unit tests for them.

## Steps

1. Ask the user which file to target if not clear from context
2. Read the target file to understand what it exports
3. Check for an existing `*.test.ts` or `*.test.tsx` file alongside it
4. Identify exported functions/components that have no test coverage or thin coverage
5. Generate tests using Vitest (`describe`, `it`, `expect`) with:
   - Happy path: normal expected input
   - Edge cases: empty string, empty array, null/undefined where applicable
   - Error cases: what happens when Supabase or Jina API returns an error
6. Write the tests to the test file (create it if it doesn't exist, name it `<filename>.test.ts`)
7. Run `npx vitest run <test-file>` to verify the tests pass
8. If tests fail, fix them — do NOT change the source file to make tests pass

## Test style

- Use `vi.fn()` and `vi.mock()` to mock external dependencies (Supabase client, Jina API fetch calls)
- Test the function's behavior, not its implementation details
- Hebrew string literals are fine in test assertions
- Keep test descriptions in English
