/// <reference types="node" />
import { execSync } from 'child_process';

/**
 * Git commit data structure matching the format from git log
 */
export interface GitCommit {
  commit: string;
  abbreviated_commit: string;
  tree: string;
  abbreviated_tree: string;
  parent: string;
  abbreviated_parent: string;
  refs: string;
  encoding: string;
  subject: string;
  sanitized_subject_line: string;
  body: string;
  commit_notes: string;
  verification_flag: string;
  signer: string;
  signer_key: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  commiter: {
    name: string;
    email: string;
    date: string;
  };
}

/**
 * Git branch information
 */
export interface GitBranch {
  name: string;
  isCurrent: boolean;
  commit: string;
  abbreviated_commit: string;
  subject: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
}

/**
 * Git tag information
 */
export interface GitTag {
  name: string;
  commit: string;
  abbreviated_commit: string;
  subject: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  tagger?: {
    name: string;
    email: string;
    date: string;
  };
  message?: string;
}

/**
 * Options for getting commits
 */
export interface GetCommitsOptions {
  maxCount?: number;
  since?: string;
  until?: string;
  author?: string;
  path?: string;
  all?: boolean; // Include all branches
}

/**
 * Delimiter used to separate fields in git log output
 * Using a unique delimiter that's unlikely to appear in commit messages
 */
const GIT_LOG_DELIMITER = '|||GIT_LOG_DELIMITER|||';

/**
 * Internal helper function to parse git log output into GitCommit objects
 */
function parseGitLogOutput(output: string, delimiter: string): GitCommit[] {
  if (!output.trim()) {
    return [];
  }

  const commits: GitCommit[] = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.split(delimiter);
    
    if (parts.length < 20) {
      // Skip malformed entries
      continue;
    }

    const commit: GitCommit = {
      commit: parts[0] || '',
      abbreviated_commit: parts[1] || '',
      tree: parts[2] || '',
      abbreviated_tree: parts[3] || '',
      parent: parts[4] || '',
      abbreviated_parent: parts[5] || '',
      refs: parts[6] || '',
      encoding: parts[7] || '',
      subject: parts[8] || '',
      sanitized_subject_line: parts[9] || '',
      body: parts[10] || '',
      commit_notes: parts[11] || '',
      verification_flag: parts[12] || '',
      signer: parts[13] || '',
      signer_key: parts[14] || '',
      author: {
        name: parts[15] || '',
        email: parts[16] || '',
        date: parts[17] || '',
      },
      commiter: {
        name: parts[18] || '',
        email: parts[19] || '',
        date: parts[20] || '',
      },
    };

    commits.push(commit);
  }

  return commits;
}

/**
 * Internal helper function to build git log command
 */
function buildGitLogCommand(options: GetCommitsOptions & { branch?: string }): string {
  let command = 'git log';
  
  if (options.maxCount) {
    command += ` -n ${options.maxCount}`;
  }
  
  if (options.all) {
    command += ' --all';
  }
  
  if (options.branch) {
    command += ` ${options.branch}`;
  }
  
  if (options.since) {
    command += ` --since="${options.since}"`;
  }
  
  if (options.until) {
    command += ` --until="${options.until}"`;
  }
  
  if (options.author) {
    command += ` --author="${options.author}"`;
  }
  
  if (options.path) {
    command += ` -- ${options.path}`;
  }

  // Use delimiter-separated format to avoid JSON escaping issues
  const format = [
    '%H',           // commit hash
    '%h',           // abbreviated commit hash
    '%T',           // tree hash
    '%t',           // abbreviated tree hash
    '%P',           // parent hashes
    '%p',           // abbreviated parent hashes
    '%D',           // refs
    '%e',           // encoding
    '%s',           // subject
    '%f',           // sanitized subject
    '%b',           // body
    '%N',           // commit notes
    '%G?',          // verification flag
    '%GS',          // signer
    '%GK',          // signer key
    '%aN',          // author name
    '%aE',          // author email
    '%aD',          // author date
    '%cN',          // committer name
    '%cE',          // committer email
    '%cD',          // committer date
  ].join(GIT_LOG_DELIMITER);

  command += ` --pretty=format:"${format}"`;
  
  return command;
}

/**
 * Gets commits from the current branch or all branches
 * 
 * @param options - Options for filtering commits
 * @returns Array of GitCommit objects
 */
export function getCommits(options: GetCommitsOptions = {}): GitCommit[] {
  const command = buildGitLogCommand(options);

  try {
    const output = execSync(command, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return parseGitLogOutput(output, GIT_LOG_DELIMITER);
  } catch (error) {
    console.error('Error executing git log:', error);
    throw error;
  }
}

/**
 * Gets commits from a specific branch
 * 
 * @param branchName - Name of the branch to get commits from
 * @param options - Additional options for filtering commits
 * @returns Array of GitCommit objects from the specified branch
 */
export function getCommitsFromBranch(
  branchName: string,
  options: Omit<GetCommitsOptions, 'all'> = {}
): GitCommit[] {
  const command = buildGitLogCommand({ ...options, branch: branchName });

  try {
    const output = execSync(command, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return parseGitLogOutput(output, GIT_LOG_DELIMITER);
  } catch (error) {
    console.error(`Error executing git log for branch ${branchName}:`, error);
    throw error;
  }
}

/**
 * Gets all branches in the repository
 * 
 * @param options - Options for filtering branches
 * @param options.remote - Include remote branches (default: false)
 * @param options.all - Include both local and remote branches (default: false)
 * @returns Array of GitBranch objects
 */
export function getBranches(options: {
  remote?: boolean;
  all?: boolean;
} = {}): GitBranch[] {
  try {
    let command = 'git branch';
    
    if (options.all) {
      command += ' -a';
    } else if (options.remote) {
      command += ' -r';
    }
    
    command += ' --format="%(refname:short)|||%(HEAD)|||%(objectname)|||%(objectname:short)|||%(subject)|||%(authorname)|||%(authoremail)|||%(authordate)"';

    const output = execSync(command, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!output.trim()) {
      return [];
    }

    const branches: GitBranch[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split('|||');
      
      if (parts.length < 8) {
        continue;
      }

      const name = parts[0] || '';
      const isCurrent = parts[1] === '*';
      const commit = parts[2] || '';
      const abbreviated_commit = parts[3] || '';
      const subject = parts[4] || '';
      const authorName = parts[5] || '';
      const authorEmail = parts[6] || '';
      const authorDate = parts[7] || '';

      branches.push({
        name,
        isCurrent,
        commit,
        abbreviated_commit,
        subject,
        author: {
          name: authorName,
          email: authorEmail,
          date: authorDate,
        },
      });
    }

    return branches;
  } catch (error) {
    console.error('Error executing git branch:', error);
    throw error;
  }
}

/**
 * Gets all tags in the repository
 * 
 * @param options - Options for filtering tags
 * @param options.sort - Sort tags by version (default: false)
 * @returns Array of GitTag objects
 */
export function getTags(options: {
  sort?: boolean;
} = {}): GitTag[] {
  try {
    let command = 'git tag';
    
    if (options.sort) {
      command += ' --sort=-version:refname';
    }

    const tagListOutput = execSync(command, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!tagListOutput.trim()) {
      return [];
    }

    const tagNames = tagListOutput.trim().split('\n').filter(name => name.trim());
    const tags: GitTag[] = [];

    for (const tagName of tagNames) {
      try {
        // Get tag details
        const showCommand = `git show ${tagName} --no-patch --format="%(objectname)|||%(objectname:short)|||%(subject)|||%(authorname)|||%(authoremail)|||%(authordate)|||%(taggername)|||%(taggeremail)|||%(taggerdate)|||%(body)"`;
        
        const showOutput = execSync(showCommand, { 
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });

        const parts = showOutput.trim().split('|||');
        
        if (parts.length >= 6) {
          const commit = parts[0] || '';
          const abbreviated_commit = parts[1] || '';
          const subject = parts[2] || '';
          const authorName = parts[3] || '';
          const authorEmail = parts[4] || '';
          const authorDate = parts[5] || '';
          const taggerName = parts[6] || '';
          const taggerEmail = parts[7] || '';
          const taggerDate = parts[8] || '';
          const message = parts[9] || '';

          tags.push({
            name: tagName,
            commit,
            abbreviated_commit,
            subject,
            author: {
              name: authorName,
              email: authorEmail,
              date: authorDate,
            },
            tagger: taggerName ? {
              name: taggerName,
              email: taggerEmail,
              date: taggerDate,
            } : undefined,
            message: message || undefined,
          });
        }
      } catch (error) {
        // If tag details can't be retrieved, create a minimal tag entry
        try {
          const commitCommand = `git rev-parse ${tagName}`;
          const commit = execSync(commitCommand, { encoding: 'utf-8' }).trim();
          const abbreviatedCommit = commit.substring(0, 7);
          
          tags.push({
            name: tagName,
            commit,
            abbreviated_commit: abbreviatedCommit,
            subject: '',
            author: {
              name: '',
              email: '',
              date: '',
            },
          });
        } catch (err) {
          // Skip tags that can't be processed
          continue;
        }
      }
    }

    return tags;
  } catch (error) {
    console.error('Error executing git tag:', error);
    throw error;
  }
}

