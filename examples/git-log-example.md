# Git Log JSON Example

## The Problem

When using git log with JSON formatting, special characters in commit messages break the JSON output:

```bash
# This breaks with commit messages containing backslashes, quotes, or newlines
git log --pretty=format:'{"subject": "%s"}'
```

Example commit message that breaks it:
```
Added logic, but it doesn't look nice yet \_o_/
```

## The Solution

Use the provided utility that properly escapes all special characters:

### Command Line Usage

```bash
# Get last 10 commits as pretty-printed JSON
npm run git-log-json -- --max-count 10 --pretty

# Get commits from a specific branch
npm run git-log-json -- --branch main --pretty

# Filter by author
npm run git-log-json -- --author "John Doe" --pretty

# Filter by date range
npm run git-log-json -- --since "2024-01-01" --until "2024-12-31" --pretty
```

### Programmatic Usage

```typescript
import { getGitLogAsJson, getGitLogAsJsonString } from './lib/git-log';

// Get as array of commit objects
const commits = getGitLogAsJson({ 
  maxCount: 10 
});

// Get as JSON string (pretty-printed)
const json = getGitLogAsJsonString({ 
  maxCount: 10 
}, true);

console.log(json);
```

## How It Works

The utility:
1. Uses a delimiter-separated format internally (avoiding JSON escaping issues)
2. Parses the git log output line by line
3. Properly escapes all JSON special characters using JavaScript's built-in JSON handling
4. Returns valid JSON even with commit messages containing:
   - Backslashes (`\`)
   - Quotes (`"` or `'`)
   - Newlines (`\n`)
   - Unicode characters
   - Any other special characters

