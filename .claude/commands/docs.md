Add JSDoc comments to all exported functions and components in the current file.

## Steps

1. Ask the user which file to document if not clear from context
2. Read the full file
3. For each exported function or component, add a JSDoc comment that includes:
   - One-line description of what it does (not how)
   - `@param` for each parameter with type and description (skip if the TypeScript type is already self-explanatory)
   - `@returns` describing the return value (skip for `void`)
   - `@throws` if the function can throw (e.g., on network failure)
4. Skip internal/private helpers — only document exported symbols
5. Run `npm run lint` after editing to ensure no lint errors were introduced

## Style rules

- One sentence max per description — if you need more, the function is too complex
- Describe WHAT and WHY, not HOW
- Do NOT restate what the TypeScript types already say
- No `@author`, `@date`, `@version`, or changelog entries
- Keep Hebrew context in descriptions where relevant (e.g., "Returns the Hebrew fallback message when no Q&A match is found")
