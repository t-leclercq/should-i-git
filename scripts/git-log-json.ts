#!/usr/bin/env node
/**
 * CLI script to get git log as properly escaped JSON
 * 
 * Usage:
 *   npm run git-log-json [options]
 *   node scripts/git-log-json.ts [options]
 * 
 * Options:
 *   --max-count <n>    Limit the number of commits
 *   --branch <branch>  Show commits from specific branch
 *   --since <date>     Show commits since date
 *   --until <date>     Show commits until date
 *   --author <name>    Filter by author
 *   --path <path>      Filter by file path
 *   --pretty           Pretty-print JSON output
 */

import { getGitLogAsJsonString } from '../src/lib/git-log.js';

interface CliOptions {
  maxCount?: number;
  branch?: string;
  since?: string;
  until?: string;
  author?: string;
  path?: string;
  pretty?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--max-count':
        if (nextArg) {
          options.maxCount = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--branch':
        if (nextArg) {
          options.branch = nextArg;
          i++;
        }
        break;
      case '--since':
        if (nextArg) {
          options.since = nextArg;
          i++;
        }
        break;
      case '--until':
        if (nextArg) {
          options.until = nextArg;
          i++;
        }
        break;
      case '--author':
        if (nextArg) {
          options.author = nextArg;
          i++;
        }
        break;
      case '--path':
        if (nextArg) {
          options.path = nextArg;
          i++;
        }
        break;
      case '--pretty':
        options.pretty = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Git Log to JSON Converter

Usage:
  npm run git-log-json [options]
  node scripts/git-log-json.ts [options]

Options:
  --max-count <n>    Limit the number of commits
  --branch <branch>  Show commits from specific branch
  --since <date>     Show commits since date (e.g., "2024-01-01")
  --until <date>     Show commits until date
  --author <name>    Filter by author name or email
  --path <path>      Filter by file path
  --pretty           Pretty-print JSON output
  --help, -h         Show this help message

Examples:
  npm run git-log-json -- --max-count 10 --pretty
  npm run git-log-json -- --author "John Doe" --since "2024-01-01"
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

function main() {
  try {
    const options = parseArgs();
    const { pretty, ...gitOptions } = options;
    
    const json = getGitLogAsJsonString(gitOptions, pretty ?? false);
    console.log(json);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

