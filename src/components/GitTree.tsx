import * as React from "react";

interface CommitNode {
  commit: string;
  parent: string;
  branchRefs: string[];
  index: number;
  lane: number;
  isOnMainLine: boolean;
}

interface BranchColor {
  branch: string;
  color: string;
  lane: number;
}

interface GitTreeProps {
  allCommits: Array<{
    commit: string;
    parent: string;
    refs: string;
  }>;
  totalRows: number;
  rowPositions: number[];
  headerHeight: number;
  totalHeight: number;
  width: number;
}

// Predefined colors for branches
const BRANCH_COLORS = [
  "#3b82f6", // blue (main)
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

/**
 * Parse refs to extract branch names (local branches only)
 * Handles remote branches by stripping "origin/" prefix and using local branch name
 */
function parseBranchRefs(refs: string): string[] {
  if (!refs || !refs.trim()) {
    return [];
  }

  const refsList = refs
    .split(',')
    .map(ref => ref.trim())
    .filter(ref => ref.length > 0);

  const branches: string[] = [];
  const seenLocalBranches = new Set<string>();

  for (const ref of refsList) {
    if (ref === 'HEAD' || ref.endsWith(' -> HEAD')) {
      continue;
    }

    let branchName: string | null = null;

    if (ref.includes(' -> ')) {
      branchName = ref.split(' -> ')[1].trim();
      if (branchName === 'HEAD') {
        continue;
      }
    } else {
      branchName = ref;
    }

    if (!branchName) continue;

    // Handle remote branches: strip "origin/" prefix
    let localBranchName = branchName;
    if (branchName.startsWith('origin/')) {
      localBranchName = branchName.substring(7); // Remove "origin/" prefix
    }

    // Only add if it's a local branch (no remaining slashes) and we haven't seen the local name yet
    // Prefer local branch over remote branch if both exist
    if (!localBranchName.includes('/') && localBranchName !== 'HEAD') {
      if (!seenLocalBranches.has(localBranchName)) {
        branches.push(localBranchName);
        seenLocalBranches.add(localBranchName);
      }
    }
  }

  return [...new Set(branches)].sort();
}

/**
 * Build tree structure - identify main line and branch lanes
 */
function buildTreeStructure(
  commits: Array<{ commit: string; parent: string; refs: string }>
): {
  nodes: Map<string, CommitNode>;
  branchColors: Map<string, BranchColor>;
  mainLineCommits: Set<string>;
  mainBranch: string | null;
} {
  const nodes = new Map<string, CommitNode>();
  const branchColors = new Map<string, BranchColor>();
  const commitToLane = new Map<string, number>();
  const commitToBranch = new Map<string, string>();
  const mainLineCommits = new Set<string>();
  let nextLane = 1; // Lane 0 is main line

  // Create nodes
  commits.forEach((commit, index) => {
    const branchRefs = parseBranchRefs(commit.refs);
    nodes.set(commit.commit, {
      commit: commit.commit,
      parent: commit.parent,
      branchRefs,
      index,
      lane: 0,
      isOnMainLine: false,
    });
  });

  // Identify main branch (usually "main" or "master")
  // IMPORTANT: Only look for "main" or "master", never use other branches as main
  let mainBranch: string | null = null;
  for (const commit of commits) {
    const branchRefs = parseBranchRefs(commit.refs);
    if (branchRefs.includes('main')) {
      mainBranch = 'main';
      break;
    } else if (branchRefs.includes('master')) {
      mainBranch = 'master';
      break;
    }
  }

  // If no main/master found, don't default to another branch - leave it as null
  // This ensures that only "main" or "master" are treated as main branch
  // Other branches will be treated as feature branches

  // First, build a map of commits that are part of non-main branches
  // This includes both descendants (children) AND ancestors (parents) of branch tips
  // This helps us exclude commits that are part of feature branches even if they don't have branch refs
  const branchDescendants = new Set<string>();
  
  // First pass: mark all commits that have non-main branch refs as branch descendants
  commits.forEach(commit => {
    const branchRefs = parseBranchRefs(commit.refs);
    if (branchRefs.length > 0 && !branchRefs.includes(mainBranch || '') && !branchRefs.includes('master')) {
      branchDescendants.add(commit.commit);
    }
  });
  
  // Second pass: trace forward from branch tips to mark descendants (children)
  commits.forEach(commit => {
    const branchRefs = parseBranchRefs(commit.refs);
    // If this commit has a non-main branch ref, trace forward to mark all descendants
    if (branchRefs.length > 0 && !branchRefs.includes(mainBranch || '') && !branchRefs.includes('master')) {
      const visited = new Set<string>();
      const queue: string[] = [commit.commit];
      visited.add(commit.commit);
      
      // Debug logging for feature-branch
      const isFeatureBranch = branchRefs.includes('feature-branch');
      if (isFeatureBranch) {
        console.log(`GitTree: Tracing forward from ${commit.commit.substring(0, 7)} (feature-branch tip) to mark descendants`);
      }
      
      // Trace forward to mark all descendants (children)
      while (queue.length > 0) {
        const current = queue.shift()!;
        // Find all commits that have current as a parent (children of current)
        commits.forEach(c => {
          const cParents = c.parent.split(' ').filter(p => p.trim());
          if (cParents.includes(current) && !visited.has(c.commit)) {
            visited.add(c.commit);
            queue.push(c.commit);
            branchDescendants.add(c.commit);
            if (isFeatureBranch && c.commit.includes('3ad0351')) {
              console.log(`GitTree: Marked ${c.commit.substring(0, 7)} as branch descendant (child of ${current.substring(0, 7)})`);
            }
          }
        });
      }
    }
  });
  
  // Third pass: trace backward from branch tips to mark ancestors
  // Also trace forward to find all commits on the branch path (handles broken parent chains after reset)
  commits.forEach(commit => {
    const branchRefs = parseBranchRefs(commit.refs);
    if (branchRefs.length > 0 && !branchRefs.includes(mainBranch || '') && !branchRefs.includes('master')) {
      const isFeatureBranch = branchRefs.includes('feature-branch');
      if (isFeatureBranch) {
        console.log(`GitTree: Tracing backward from ${commit.commit.substring(0, 7)} (feature-branch tip) to mark ancestors`);
      }
      
      // Find the main tip to check ancestors
      const mainTip = commits.find(c => parseBranchRefs(c.refs).includes(mainBranch || ''));
      if (!mainTip) return;
      
      // Build a set of main line ancestors (commits that are ancestors of main tip)
      const mainLineAncestors = new Set<string>();
      const mainVisited = new Set<string>();
      const mainQueue: string[] = [mainTip.commit];
      mainVisited.add(mainTip.commit);
      mainLineAncestors.add(mainTip.commit);
      
      while (mainQueue.length > 0) {
        const current = mainQueue.shift()!;
        const currentNode = nodes.get(current);
        if (!currentNode) continue;
        
        const parents = currentNode.parent.split(' ').filter(p => p.trim());
        for (const parent of parents) {
          if (!mainVisited.has(parent) && nodes.has(parent)) {
            mainVisited.add(parent);
            mainQueue.push(parent);
            mainLineAncestors.add(parent);
          }
        }
      }
      
      // Now trace backward from branch tip, stopping at common ancestor
      const backwardVisited = new Set<string>();
      const backwardQueue: string[] = [commit.commit];
      backwardVisited.add(commit.commit);
      
      while (backwardQueue.length > 0) {
        const current = backwardQueue.shift()!;
        const currentNode = nodes.get(current);
        if (!currentNode) continue;
        
        const parents = currentNode.parent.split(' ').filter(p => p.trim());
        for (const parent of parents) {
          if (!backwardVisited.has(parent) && nodes.has(parent)) {
            // Stop if parent is an ancestor of main tip (it's the common ancestor or on main line)
            if (mainLineAncestors.has(parent)) {
              if (isFeatureBranch && parent.includes('165d919')) {
                console.log(`GitTree: Stopped at common ancestor ${parent.substring(0, 7)}`);
              }
              continue; // Stop here, this is the common ancestor
            }
            
            backwardVisited.add(parent);
            backwardQueue.push(parent);
            branchDescendants.add(parent);
            if (isFeatureBranch && parent.includes('3ad0351')) {
              console.log(`GitTree: Marked ${parent.substring(0, 7)} as branch descendant (ancestor of ${commit.commit.substring(0, 7)})`);
            }
          }
        }
      }
      
      // Additional pass: find all commits that are parents of already-marked branch descendants
      // This handles cases where parent chain is broken after commit removal
      // Also check if any commit in the list has a branch descendant as a child (reverse lookup)
      let foundMore = true;
      let iteration = 0;
      while (foundMore && iteration < 10) { // Limit iterations to prevent infinite loops
        foundMore = false;
        iteration++;
        
        // Forward: find parents of branch descendants
        commits.forEach(c => {
          if (branchDescendants.has(c.commit)) {
            const parents = c.parent.split(' ').filter(p => p.trim());
            for (const parent of parents) {
              if (nodes.has(parent) && !branchDescendants.has(parent) && !mainLineAncestors.has(parent)) {
                branchDescendants.add(parent);
                foundMore = true;
                if (isFeatureBranch && parent.includes('3ad0351')) {
                  console.log(`GitTree: [ADDITIONAL PASS] Marked ${parent.substring(0, 7)} as branch descendant (parent of ${c.commit.substring(0, 7)})`);
                }
              }
            }
          }
        });
        
        // Reverse: find commits that have branch descendants as children
        commits.forEach(c => {
          if (!branchDescendants.has(c.commit) && !mainLineAncestors.has(c.commit)) {
            const parents = c.parent.split(' ').filter(p => p.trim());
            // Check if any of this commit's children are branch descendants
            commits.forEach(child => {
              const childParents = child.parent.split(' ').filter(p => p.trim());
              if (childParents.includes(c.commit) && branchDescendants.has(child.commit)) {
                branchDescendants.add(c.commit);
                foundMore = true;
                if (isFeatureBranch && c.commit.includes('3ad0351')) {
                  console.log(`GitTree: [ADDITIONAL PASS REVERSE] Marked ${c.commit.substring(0, 7)} as branch descendant (has branch descendant child ${child.commit.substring(0, 7)})`);
                }
              }
            });
          }
        });
      }
      
      // Final pass: Find all commits that are ancestors of the branch tip
      // This handles cases where the parent chain is completely broken after reset
      // We check if commits are parents of commits that lead to branch tip (recursively)
      if (isFeatureBranch) {
        const branchTip = commit.commit;
        
        // Build a helper function to check if a commit leads to branch tip
        const leadsToBranchTip = (commitHash: string): boolean => {
          const visited = new Set<string>();
          const queue: string[] = [commitHash];
          visited.add(commitHash);
          
          while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === branchTip) return true;
            
            // Find all commits that have current as a parent
            commits.forEach(child => {
              const childParents = child.parent.split(' ').filter(p => p.trim());
              if (childParents.includes(current) && !visited.has(child.commit)) {
                visited.add(child.commit);
                queue.push(child.commit);
              }
            });
          }
          return false;
        };
        
        // Build a set of commits that are on the path from branch tip to common ancestor
        // This helps us identify commits that should be on the branch even if they're also ancestors of main
        const branchPathCommits = new Set<string>();
        const branchPathVisited = new Set<string>();
        const branchPathQueue: string[] = [branchTip];
        branchPathVisited.add(branchTip);
        branchPathCommits.add(branchTip);
        
        // Trace backward from branch tip to find all commits on the branch path
        while (branchPathQueue.length > 0) {
          const current = branchPathQueue.shift()!;
          const currentNode = nodes.get(current);
          if (!currentNode) continue;
          
          const parents = currentNode.parent.split(' ').filter(p => p.trim());
          for (const parent of parents) {
            if (!branchPathVisited.has(parent) && nodes.has(parent)) {
              // Stop if we hit a main line ancestor (common ancestor)
              if (mainLineAncestors.has(parent)) {
                continue; // Stop here, this is the common ancestor
              }
              branchPathVisited.add(parent);
              branchPathQueue.push(parent);
              branchPathCommits.add(parent);
            }
          }
        }
        
        // Mark all commits on the branch path as branch descendants
        branchPathCommits.forEach(commitHash => {
          if (!branchDescendants.has(commitHash) && !mainLineAncestors.has(commitHash)) {
            branchDescendants.add(commitHash);
            if (commitHash.includes('3ad0351')) {
              console.log(`GitTree: [FINAL PASS] Marked ${commitHash.substring(0, 7)} as branch descendant (on branch path from ${branchTip.substring(0, 7)})`);
            }
          }
        });
        
        // Recursively find all ancestors: if a commit is a parent of a commit that leads to branch tip, it's also an ancestor
        let foundMore = true;
        let finalPassIteration = 0;
        while (foundMore && finalPassIteration < 20) {
          foundMore = false;
          finalPassIteration++;
          
          commits.forEach(c => {
            if (branchDescendants.has(c.commit) || mainLineAncestors.has(c.commit)) {
              return; // Already processed
            }
            
            // Check if this commit is a parent of ANY commit that leads to branch tip
            let isAncestorOfBranchTip = false;
            commits.forEach(child => {
              const childParents = child.parent.split(' ').filter(p => p.trim());
              if (childParents.includes(c.commit)) {
                // Check if child leads to branch tip OR is already marked as branch descendant
                if (branchDescendants.has(child.commit) || leadsToBranchTip(child.commit)) {
                  isAncestorOfBranchTip = true;
                }
              }
            });
            
            if (isAncestorOfBranchTip && !mainLineAncestors.has(c.commit)) {
              branchDescendants.add(c.commit);
              foundMore = true;
              if (c.commit.includes('3ad0351')) {
                console.log(`GitTree: [FINAL PASS] Marked ${c.commit.substring(0, 7)} as branch descendant (parent of commit leading to ${branchTip.substring(0, 7)}, iteration ${finalPassIteration})`);
              }
            }
          });
        }
        
        if (isFeatureBranch && finalPassIteration >= 20) {
          console.warn(`GitTree: Final pass reached iteration limit (20)`);
        }
      }
      if (isFeatureBranch && iteration >= 10) {
        console.warn(`GitTree: Additional pass reached iteration limit (10)`);
      }
    }
  });

  // Mark main line commits - trace from main branch tip backwards
  if (mainBranch) {
    const mainTip = commits.find(c => parseBranchRefs(c.refs).includes(mainBranch!));
    if (mainTip) {
      const visited = new Set<string>();
      const queue: string[] = [mainTip.commit];
      visited.add(mainTip.commit);
      mainLineCommits.add(mainTip.commit);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const node = nodes.get(current);
        if (!node) continue;

        const parents = node.parent.split(' ').filter(p => p.trim());
        for (const parent of parents) {
          if (!visited.has(parent) && nodes.has(parent)) {
            const parentNode = nodes.get(parent);
            // Don't mark commits as main line if they belong to other branches (like feature-branch)
            // Check if the parent commit has branch refs that are not main/master
            if (parentNode) {
              const parentBranchRefs = parentNode.branchRefs;
              const hasNonMainBranch = parentBranchRefs.some(branch => branch !== mainBranch && branch !== 'master');
              if (hasNonMainBranch) {
                // This commit belongs to another branch, don't mark it as main line
                continue;
              }
            }
            
            // Don't mark as main line if this commit is a descendant of a non-main branch
            if (branchDescendants.has(parent)) {
              continue;
            }
            
            visited.add(parent);
            queue.push(parent);
            mainLineCommits.add(parent);
          }
        }
      }
    }
  } else {
    // No main branch found - don't mark any commits as main line
    // All commits will be treated as branch commits
    // This is correct when there's no "main" or "master" branch
  }

  // Assign lanes to branch tips
  // IMPORTANT: Process commits in reverse order (newest first) to ensure branch tips are assigned first
  const commitsReversed = [...commits].reverse();
  commitsReversed.forEach((commit) => {
    const branchRefs = parseBranchRefs(commit.refs);
    
    // Debug logging for commits we care about
    if (commit.commit.includes('09af298') || commit.commit.includes('3ad0351')) {
      console.log(`GitTree: Processing commit ${commit.commit.substring(0, 7)} for lane assignment`, {
        refs: commit.refs,
        branchRefs,
        mainBranch,
      });
    }
    
    if (branchRefs.length > 0) {
      const primaryBranch = branchRefs[0];
      
      // Main branch stays on lane 0
      if (primaryBranch === mainBranch) {
        commitToLane.set(commit.commit, 0);
        commitToBranch.set(commit.commit, primaryBranch);
        const node = nodes.get(commit.commit)!;
        node.lane = 0;
        node.isOnMainLine = true;
        if (commit.commit.includes('09af298') || commit.commit.includes('3ad0351')) {
          console.log(`GitTree: Assigned ${commit.commit.substring(0, 7)} to main (lane 0)`);
        }
      } else {
        // Other branches get their own lanes
        if (!branchColors.has(primaryBranch)) {
          const colorIndex = (branchColors.size % (BRANCH_COLORS.length - 1)) + 1; // Skip index 0 (main)
          branchColors.set(primaryBranch, {
            branch: primaryBranch,
            color: BRANCH_COLORS[colorIndex],
            lane: nextLane++,
          });
          console.log(`GitTree: Created branch color for ${primaryBranch}`, {
            color: BRANCH_COLORS[colorIndex],
            lane: nextLane - 1,
          });
        }
        
        const branchColor = branchColors.get(primaryBranch)!;
        commitToLane.set(commit.commit, branchColor.lane);
        commitToBranch.set(commit.commit, primaryBranch);
        const node = nodes.get(commit.commit)!;
        node.lane = branchColor.lane;
        node.isOnMainLine = false;
        if (commit.commit.includes('09af298') || commit.commit.includes('3ad0351')) {
          console.log(`GitTree: Assigned ${commit.commit.substring(0, 7)} to ${primaryBranch}`, {
            lane: branchColor.lane,
            color: branchColor.color,
          });
        }
      }
    } else {
      if (commit.commit.includes('09af298') || commit.commit.includes('3ad0351')) {
        console.warn(`GitTree: No branch refs found for ${commit.commit.substring(0, 7)}`, {
          refs: commit.refs,
          parsedBranchRefs: branchRefs,
        });
      }
    }
  });

  // Propagate lanes backwards through history
  commits.forEach((commit) => {
    const node = nodes.get(commit.commit)!;
    const isTargetCommit = commit.commit.includes('3ad0351');
    
    if (commitToLane.has(commit.commit)) {
      return; // Already assigned
    }

    // CRITICAL FIX: Check if branch descendant FIRST, before any main line checks
    // This ensures branch descendants always get assigned to a branch lane
    if (branchDescendants.has(commit.commit)) {
      // Assign to first branch immediately if branch colors exist
      if (branchColors.size > 0) {
        const firstBranch = Array.from(branchColors.values())[0];
        commitToLane.set(commit.commit, firstBranch.lane);
        commitToBranch.set(commit.commit, firstBranch.branch);
        node.lane = firstBranch.lane;
        node.isOnMainLine = false;
        if (isTargetCommit) {
          console.log(`GitTree: [FIXED] Assigned ${commit.commit.substring(0, 7)} to branch lane ${firstBranch.lane} (${firstBranch.branch}) - branch descendant`);
        }
        return;
      }
      
      // If no branch colors exist yet, this shouldn't happen, but handle it gracefully
      // Don't assign to main line - leave it unassigned or assign later
      if (isTargetCommit) {
        console.error(`GitTree: ${commit.commit.substring(0, 7)} is a branch descendant but no branch colors exist! This should not happen.`);
      }
      return;
    }

    // Check if on main line - only for non-branch-descendants
    if (mainLineCommits.has(commit.commit)) {
      commitToLane.set(commit.commit, 0);
      node.lane = 0;
      node.isOnMainLine = true;
      return;
    }

    // If it's a branch descendant but not assigned yet, find branch assignment
    // (This block should not be reached if the check above worked, but keeping for safety)
    if (branchDescendants.has(commit.commit)) {
      // Assign to first branch immediately if branch colors exist
      if (branchColors.size > 0) {
        const firstBranch = Array.from(branchColors.values())[0];
        commitToLane.set(commit.commit, firstBranch.lane);
        commitToBranch.set(commit.commit, firstBranch.branch);
        node.lane = firstBranch.lane;
        node.isOnMainLine = false;
        return;
      }
      
      // First, check if this commit itself has a branch ref - if so, assign it to that branch's lane
      const commitBranchRefs = parseBranchRefs(commit.refs);
      if (commitBranchRefs.length > 0 && !commitBranchRefs.includes(mainBranch || '') && !commitBranchRefs.includes('master')) {
        const branchName = commitBranchRefs[0];
        // Find or create the branch color/lane
        if (!branchColors.has(branchName)) {
          const colorIndex = (branchColors.size % (BRANCH_COLORS.length - 1)) + 1;
          branchColors.set(branchName, {
            branch: branchName,
            color: BRANCH_COLORS[colorIndex],
            lane: nextLane++,
          });
        }
        const branchColor = branchColors.get(branchName)!;
        commitToLane.set(commit.commit, branchColor.lane);
        commitToBranch.set(commit.commit, branchName);
        node.lane = branchColor.lane;
        node.isOnMainLine = false;
        return;
      }
      
      // First, try tracing forward (to children) to find the branch tip
      // This handles cases where the commit is an ancestor of the branch tip
      const forwardVisited = new Set<string>();
      const forwardQueue: string[] = [commit.commit];
      forwardVisited.add(commit.commit);
      let foundLane: number | null = null;
      let foundBranch: string | null = null;

      if (isTargetCommit) {
        console.log(`GitTree: Tracing forward from ${commit.commit.substring(0, 7)} to find branch tip`);
      }

      // Trace forward to find commits with assigned lanes (branch tips)
      while (forwardQueue.length > 0 && foundLane === null) {
        const current = forwardQueue.shift()!;
        
        if (isTargetCommit) {
          console.log(`GitTree: Checking ${current.substring(0, 7)} in forward trace`, {
            hasLane: commitToLane.has(current),
            lane: commitToLane.has(current) ? commitToLane.get(current) : null,
          });
        }
        
        if (commitToLane.has(current)) {
          const lane = commitToLane.get(current)!;
          if (lane > 0) {
            // Found a branch lane
            foundLane = lane;
            foundBranch = commitToBranch.get(current) || null;
            if (isTargetCommit) {
              console.log(`GitTree: Found branch lane ${foundLane} (${foundBranch}) for ${commit.commit.substring(0, 7)} via forward trace from ${current.substring(0, 7)}`);
            }
            break;
          }
        }

        // Find children (commits that have current as a parent)
        const children: string[] = [];
        commits.forEach(c => {
          const cParents = c.parent.split(' ').filter(p => p.trim());
          if (cParents.includes(current) && !forwardVisited.has(c.commit)) {
            forwardVisited.add(c.commit);
            forwardQueue.push(c.commit);
            children.push(c.commit);
            if (isTargetCommit) {
              console.log(`GitTree: Adding ${c.commit.substring(0, 7)} to forward queue (child of ${current.substring(0, 7)})`);
            }
          }
        });
        if (isTargetCommit && children.length === 0 && forwardQueue.length === 0) {
          console.warn(`GitTree: Forward trace from ${commit.commit.substring(0, 7)} found no children and queue is empty`);
        }
      }

      // If not found forward, try tracing backward (to parents)
      if (foundLane === null) {
        const backwardVisited = new Set<string>();
        const backwardQueue: string[] = [commit.commit];
        backwardVisited.add(commit.commit);

        while (backwardQueue.length > 0 && foundLane === null) {
          const current = backwardQueue.shift()!;
          const currentNode = nodes.get(current);
          if (!currentNode) continue;

          if (commitToLane.has(current)) {
            const lane = commitToLane.get(current)!;
            if (lane > 0) {
              foundLane = lane;
              foundBranch = commitToBranch.get(current) || null;
              break;
            }
          }

          const parents = currentNode.parent.split(' ').filter(p => p.trim());
          for (const parent of parents) {
            if (!backwardVisited.has(parent) && nodes.has(parent)) {
              backwardVisited.add(parent);
              backwardQueue.push(parent);
            }
          }
        }
      }

      if (foundLane !== null && foundLane > 0) {
        // Found a branch lane
        commitToLane.set(commit.commit, foundLane);
        node.lane = foundLane;
        if (foundBranch) {
          commitToBranch.set(commit.commit, foundBranch);
        }
        node.isOnMainLine = false;
        return;
      }
      
      // If still not found, assign to the first non-main branch we find
      // This is a safe fallback for branch descendants
      if (branchColors.size > 0) {
        const firstBranch = Array.from(branchColors.values())[0];
        commitToLane.set(commit.commit, firstBranch.lane);
        commitToBranch.set(commit.commit, firstBranch.branch);
        node.lane = firstBranch.lane;
        node.isOnMainLine = false;
        if (isTargetCommit) {
          console.log(`GitTree: Assigned ${commit.commit.substring(0, 7)} to first branch lane ${firstBranch.lane} (${firstBranch.branch}) as fallback`);
        }
        return;
      } else {
        if (isTargetCommit) {
          console.error(`GitTree: ${commit.commit.substring(0, 7)} is a branch descendant but no branch colors exist! This should not happen.`);
        }
        // CRITICAL: Still return here to prevent falling through to Trace back section
        // Even if no branch colors exist, we don't want to assign branch descendants to main line
        return;
      }
    }

    // Trace back to find branch assignment (for commits not in branchDescendants)
    // IMPORTANT: This should NOT run for branch descendants - they should have returned above
    if (branchDescendants.has(commit.commit)) {
      if (isTargetCommit) {
        console.error(`GitTree: [ERROR] ${commit.commit.substring(0, 7)} is a branch descendant but reached Trace back section! This should not happen.`);
      }
      return; // Don't process branch descendants in Trace back section
    }
    
    if (isTargetCommit) {
      console.log(`GitTree: [TRACE BACK] Processing ${commit.commit.substring(0, 7)} in Trace back section (NOT a branch descendant)`);
    }
    const visited = new Set<string>();
    const queue: string[] = [commit.commit];
    visited.add(commit.commit);
    let foundLane: number | null = null;
    let foundBranch: string | null = null;

    while (queue.length > 0 && foundLane === null) {
      const current = queue.shift()!;
      const currentNode = nodes.get(current);
      if (!currentNode) continue;

      if (commitToLane.has(current)) {
        foundLane = commitToLane.get(current)!;
        foundBranch = commitToBranch.get(current) || null;
        break;
      }

      const parents = currentNode.parent.split(' ').filter(p => p.trim());
      for (const parent of parents) {
        if (!visited.has(parent) && nodes.has(parent)) {
          visited.add(parent);
          queue.push(parent);
        }
      }
    }

    if (foundLane !== null) {
      commitToLane.set(commit.commit, foundLane);
      node.lane = foundLane;
      if (foundBranch) {
        commitToBranch.set(commit.commit, foundBranch);
      }
      node.isOnMainLine = foundLane === 0;
      if (isTargetCommit) {
        console.log(`GitTree: [TRACE BACK] Assigned ${commit.commit.substring(0, 7)} to lane ${foundLane} (isMainLine: ${node.isOnMainLine})`);
      }
    } else {
      // Default to main line
      commitToLane.set(commit.commit, 0);
      node.lane = 0;
      node.isOnMainLine = true;
      if (isTargetCommit) {
        console.warn(`GitTree: [TRACE BACK] Defaulted ${commit.commit.substring(0, 7)} to main line (lane 0)`);
      }
    }
  });

  // Handle merges - merge commits go back to main line
  commits.forEach((commit) => {
    const node = nodes.get(commit.commit)!;
    const parents = commit.parent.split(' ').filter(p => p.trim());
    
    if (parents.length > 1) {
      // Merge commit - check if any parent is on main line
      const hasMainParent = parents.some(p => mainLineCommits.has(p));
      if (hasMainParent) {
        node.lane = 0;
        node.isOnMainLine = true;
        commitToLane.set(commit.commit, 0);
      }
    }
  });

  return { nodes, branchColors, mainLineCommits, mainBranch };
}

export function GitTree({ allCommits, totalRows, rowPositions, headerHeight, totalHeight, width }: GitTreeProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [treeData, setTreeData] = React.useState<{
    nodes: Map<string, CommitNode>;
    branchColors: Map<string, BranchColor>;
    mainLineCommits: Set<string>;
    mainBranch: string | null;
  } | null>(null);

  // Create a stable reference key for commits to detect changes
  // Include commit hash, parent, and refs to catch all changes
  const commitsKey = React.useMemo(() => {
    return allCommits.map(c => `${c.commit}:${c.parent}:${c.refs}`).join('|');
  }, [allCommits]);

  // Force rebuild when commits change
  React.useEffect(() => {
    if (allCommits.length === 0) {
      setTreeData(null);
      return;
    }

    // Force re-build tree structure when commits change
    // Rebuild immediately without delay to ensure paths recalculate
    const data = buildTreeStructure(allCommits);
    setTreeData(data);
  }, [commitsKey]); // commitsKey already includes all commit data, so it's sufficient

  // Constants that don't depend on treeData
  const laneWidth = 16;
  const dotRadius = 3.5;
  const centerX = width / 2;
  const mainLineX = centerX;

  // Calculate positions for all commits using measured row positions
  // Always calculate positions for all commits, even if rowPositions is shorter
  const commitPositions = React.useMemo(() => {
    if (allCommits.length === 0) {
      return [];
    }
    
    // Always create positions for all commits, even if treeData is null
    // This ensures dots are rendered even during tree structure rebuild
    const nodes = treeData?.nodes || new Map();
    
    return allCommits.map((commit, index) => {
      // Ensure node exists - if not, create a default one
      let node = nodes.get(commit.commit);
      if (!node) {
        // Node should always exist since buildTreeStructure creates nodes for all commits
        // But if it doesn't, use defaults
        const lane = 0;
        const isOnMainLine = true;
        const x = mainLineX;
        const y = rowPositions[index] ?? (headerHeight + index * 40 + 20);
        return { commit: commit.commit, x, y, lane, index, isOnMainLine };
      }
      
      const lane = node.lane ?? 0;
      const isOnMainLine = node.isOnMainLine ?? true;
      
      // Main line commits stay centered, branch commits offset
      const x = isOnMainLine ? mainLineX : mainLineX + (lane > 0 ? laneWidth : -laneWidth) * lane;
      
      // Use the measured Y position for this row (center of the row)
      // If rowPositions doesn't have enough entries, calculate fallback position
      const y = rowPositions[index] ?? (headerHeight + index * 40 + 20);
      
      return { commit: commit.commit, x, y, lane, index, isOnMainLine };
    });
  }, [allCommits, rowPositions, treeData, headerHeight, mainLineX, laneWidth]);

  // Build paths for connections - use useMemo to ensure recalculation when dependencies change
  // Must be called before any conditional returns to follow Rules of Hooks
  const paths = React.useMemo(() => {
    if (!treeData || allCommits.length === 0 || commitPositions.length === 0) {
      return [];
    }
    
    const pathArray: Array<{
      from: { x: number; y: number; lane: number; index: number; isOnMainLine: boolean };
      to: { x: number; y: number; lane: number; index: number; isOnMainLine: boolean };
      branch: string;
      color: string;
    }> = [];
    
    const { nodes, branchColors, mainLineCommits, mainBranch } = treeData;
    const commits = allCommits;

    // Helper function to find common ancestor (where branch diverged from main)
    const findCommonAncestor = (commitHash: string, mainLineCommits: Set<string>): string | null => {
      const visited = new Set<string>();
      const queue: string[] = [commitHash];
      visited.add(commitHash);

      while (queue.length > 0) {
        const current = queue.shift()!;
        
        // If this commit is on main line, it's the common ancestor
        if (mainLineCommits.has(current)) {
          return current;
        }

        // Try to get node from map first
        let node = nodes.get(current);
        
        // If node not found, try to find it in commits array (handles updated parent references)
        if (!node) {
          const commitInArray = commits.find(c => c.commit === current);
          if (commitInArray) {
            // Create a temporary node-like structure from the commit
            const parents = commitInArray.parent.split(' ').filter(p => p.trim());
            for (const parent of parents) {
              if (!visited.has(parent)) {
                visited.add(parent);
                // Check if parent is on main line
                if (mainLineCommits.has(parent)) {
                  return parent;
                }
                // Add to queue if it exists in commits
                if (commits.some(c => c.commit === parent)) {
                  queue.push(parent);
                }
              }
            }
          }
          continue;
        }

        const parents = node.parent.split(' ').filter(p => p.trim());
        for (const parent of parents) {
          if (!visited.has(parent)) {
            visited.add(parent);
            // Check if parent is on main line first
            if (mainLineCommits.has(parent)) {
              return parent;
            }
            // Add to queue if parent exists in nodes OR in commits list
            if (nodes.has(parent) || commits.some(c => c.commit === parent)) {
              queue.push(parent);
            }
          }
        }
      }

      return null;
    };

    // First, draw all parent-child connections for main line and within branches
    commits.forEach((commit, index) => {
    const node = nodes.get(commit.commit);
    if (!node) return;

    const parents = commit.parent.split(' ').filter(p => p.trim());
    const currentPos = commitPositions[index];

    parents.forEach((parentHash) => {
      const parentIndex = commits.findIndex(c => c.commit === parentHash);
      if (parentIndex === -1) return;

      const parentPos = commitPositions[parentIndex];
      const parentNode = nodes.get(parentHash);
      
      // Only draw direct parent connections if both are on the same lane
      // (main line to main line, or same branch to same branch)
      if (node.lane === parentNode?.lane && node.isOnMainLine === parentNode.isOnMainLine) {
        // Determine branch color
        let branch = node.branchRefs[0] || (parentNode?.branchRefs[0] ?? '');
        if (!branch) {
          const lane = node.lane;
          for (const [branchName, branchColor] of branchColors.entries()) {
            if (branchColor.lane === lane) {
              branch = branchName;
              break;
            }
          }
        }

        const branchColor = branchColors.get(branch);
        const color = branchColor?.color || '#3b82f6'; // Default to blue for main

        pathArray.push({
          from: currentPos,
          to: parentPos,
          branch,
          color,
        });
      }
    });
    });

    // Now, draw branch divergence lines (from common ancestor to branch tip)
    const processedBranches = new Set<string>();
    
    // First, find all branch tips (commits with branch refs)
    // Commits are ordered newest first (index 0 is newest)
    const branchTips = new Map<string, { commit: typeof commits[0]; index: number }>();
    commits.forEach((commit, index) => {
      const branchRefs = parseBranchRefs(commit.refs);
      if (branchRefs.length > 0) {
        const branchName = branchRefs[0];
        // Keep the commit with the smallest index (newest commit) as the branch tip
        if (!branchTips.has(branchName) || branchTips.get(branchName)!.index > index) {
          branchTips.set(branchName, { commit, index });
        }
      }
    });
    
    // Process each branch
    branchTips.forEach(({ commit: branchTipCommit, index: branchTipIndex }, branchName) => {
      if (branchName === mainBranch || branchName === 'master') {
        return; // Skip main branch
      }
      
      if (processedBranches.has(branchName)) return; // Already processed
      
      const branchTipNode = nodes.get(branchTipCommit.commit);
      if (!branchTipNode) {
        processedBranches.add(branchName);
        return;
      }
      
      // Don't skip if on main line - we still want to draw the branch line
      // The branch tip might be on main line if it's a merge commit

      // Find common ancestor (where branch diverged from main)
      const commonAncestorHash = findCommonAncestor(branchTipCommit.commit, mainLineCommits);
      if (!commonAncestorHash) {
        // If no common ancestor found, skip this branch
        processedBranches.add(branchName);
        return;
      }

      const commonAncestorIndex = commits.findIndex(c => c.commit === commonAncestorHash);
      if (commonAncestorIndex === -1) {
        processedBranches.add(branchName);
        return;
      }

    const branchTipPos = commitPositions[branchTipIndex];
    const commonAncestorPos = commitPositions[commonAncestorIndex];

    // Get branch color
    const branchColor = branchColors.get(branchName);
    const color = branchColor?.color || '#3b82f6';

    // Draw branch line from common ancestor to branch tip
    pathArray.push({
      from: commonAncestorPos,
      to: branchTipPos,
      branch: branchName,
      color,
    });

    // Check if branch merges back into main
    // Find merge commit: a commit on main line that has the branch tip as a parent
    const branchTipHash = branchTipCommit.commit;
    for (let i = 0; i < commits.length; i++) {
      const mergeCommit = commits[i];
      const mergeNode = nodes.get(mergeCommit.commit);
      if (!mergeNode || !mergeNode.isOnMainLine) continue;

      const parents = mergeCommit.parent.split(' ').filter(p => p.trim());
      if (parents.includes(branchTipHash)) {
        // Found merge commit - draw path from branch tip to merge commit
        const mergePos = commitPositions[i];
        pathArray.push({
          from: branchTipPos,
          to: mergePos,
          branch: branchName,
          color,
        });
        break;
      }
    }

      processedBranches.add(branchName);
    });
    
    return pathArray;
  }, [allCommits, commitPositions, treeData, commitsKey]); // Recalculate when these change

  if (!treeData || allCommits.length === 0 || rowPositions.length === 0) {
    return <div style={{ width, height: headerHeight + totalRows * 40 }} />;
  }

  const { nodes, branchColors, mainLineCommits, mainBranch } = treeData;
  const commits = allCommits;

  // Use the measured total height
  const svgHeight = totalHeight;

  // Find first and last main line commits (not just first/last row)
  let firstMainLineY: number | null = null;
  let lastMainLineY: number | null = null;
  
  commitPositions.forEach((pos) => {
    const node = nodes.get(pos.commit);
    if (node && node.isOnMainLine) {
      if (firstMainLineY === null || pos.y < firstMainLineY) {
        firstMainLineY = pos.y;
      }
      if (lastMainLineY === null || pos.y > lastMainLineY) {
        lastMainLineY = pos.y;
      }
    }
  });

  // Fallback to first/last row if no main line commits found
  const firstRowY = firstMainLineY ?? (rowPositions[0] ?? (headerHeight + 20));
  const lastRowY = lastMainLineY ?? (rowPositions[rowPositions.length - 1] ?? (headerHeight + (totalRows - 1) * 40 + 20));

  return (
    <svg
      ref={svgRef}
      width={width}
      height={svgHeight}
      style={{ display: 'block' }}
      className="absolute top-0 left-0"
    >
      {/* Draw main vertical line - only between main line commits */}
      {commits.length > 1 && firstMainLineY !== null && lastMainLineY !== null && (
        <line
          x1={mainLineX}
          y1={firstRowY}
          x2={mainLineX}
          y2={lastRowY}
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {/* Draw connections */}
      {paths.map((path, idx) => {
        const { from, to, color } = path;
        const isDivergence = from.lane !== to.lane || from.isOnMainLine !== to.isOnMainLine;
        
        if (isDivergence) {
          // Rounded 90° corner: horizontal from source dot, then vertical to target dot
          const cornerRadius = 8;
          
          // Determine direction
          const goingRight = to.x > from.x;
          const goingDown = to.y > from.y; // Parent is below (larger Y)
          
          // Start Y: center of the source dot (line starts AT the dot)
          const startY = from.y;
          
          // Target Y: always end at the bottom of the target dot
          // Bottom of dot = center + radius = to.y + dotRadius
          const targetY = to.y + dotRadius;
          
          // Corner point: where horizontal and vertical lines meet
          const cornerX = to.x;
          
          // Calculate points for the rounded corner
          // Horizontal line ends just before the corner
          const horizontalEndX = goingRight 
            ? cornerX - cornerRadius 
            : cornerX + cornerRadius;
          
          // Vertical line starts just after the corner
          // When going down: start below the horizontal line
          // When going up: start at the top edge of the source dot (so line doesn't show above)
          const verticalStartY = goingDown 
            ? startY + cornerRadius 
            : startY - dotRadius; // Top edge of source dot, not above it
          
          // For upward paths, use smaller corner radius to ensure arc doesn't extend above dot
          const effectiveCornerRadius = goingDown ? cornerRadius : Math.min(cornerRadius, dotRadius);
          
          // Recalculate horizontal end for upward paths with smaller radius
          const effectiveHorizontalEndX = goingDown 
            ? horizontalEndX 
            : (goingRight 
              ? cornerX - effectiveCornerRadius 
              : cornerX + effectiveCornerRadius);
          
          // Arc sweep flag for rounded 90° corner
          // Right-then-down: clockwise (1)
          // Left-then-down: counter-clockwise (0)  
          // Right-then-up: counter-clockwise (0)
          // Left-then-up: clockwise (1)
          const arcSweepFlag = (goingRight && goingDown) || (!goingRight && !goingDown) ? 1 : 0;
          
          // Build the path: horizontal line from dot center -> rounded corner (arc) -> vertical line to target
          const pathData = `M ${from.x} ${startY} L ${effectiveHorizontalEndX} ${startY} A ${effectiveCornerRadius} ${effectiveCornerRadius} 0 0 ${arcSweepFlag} ${cornerX} ${verticalStartY} L ${to.x} ${targetY}`;
          
          return (
            <path
              key={`path-${idx}`}
              d={pathData}
              stroke={color}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        } else {
          // Straight vertical line for same lane
          return (
            <line
              key={`line-${idx}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        }
      })}

      {/* Draw commit dots - ensure we render a dot for EVERY commit in allCommits */}
      {allCommits.map((commit, idx) => {
        // Debug: check for 3ad0351
        const isTargetCommit = commit.commit.includes('3ad0351');
        if (isTargetCommit) {
          console.log('GitTree: Rendering dot for 3ad0351', {
            idx,
            commit: commit.commit.substring(0, 7),
            commitPositionsLength: commitPositions.length,
            rowPositionsLength: rowPositions.length,
          });
        }
        
        // Always get node first to determine color and position
        const node = nodes.get(commit.commit);
        const branchRefs = node?.branchRefs || [];
        
        // Try to find position
        let pos = commitPositions[idx];
        if (!pos || pos.commit !== commit.commit) {
          pos = commitPositions.find(p => p.commit === commit.commit);
        }
        
        if (isTargetCommit) {
          console.log('GitTree: Position for 3ad0351', {
            posByIndex: commitPositions[idx],
            posFound: pos,
            node: node ? {
              commit: node.commit.substring(0, 7),
              lane: node.lane,
              isOnMainLine: node.isOnMainLine,
              branchRefs: node.branchRefs,
            } : null,
            branchRefs,
            commitRefs: commit.refs,
            allCommitsLength: allCommits.length,
            commitIndex: idx,
            treeDataExists: !!treeData,
            nodesSize: nodes.size,
            branchColors: Array.from(branchColors.entries()).map(([name, bc]) => ({ name, lane: bc.lane, color: bc.color })),
          });
        }
        
        // Calculate position - always ensure we have valid coordinates
        let x: number;
        let y: number;
        
        if (pos && !isNaN(pos.x) && !isNaN(pos.y)) {
          x = pos.x;
          y = pos.y;
        } else {
          // Fallback position calculation
          const lane = node?.lane ?? 0;
          const isOnMainLine = node?.isOnMainLine ?? true;
          x = isOnMainLine ? mainLineX : mainLineX + (lane > 0 ? laneWidth : -laneWidth) * lane;
          y = rowPositions[idx] ?? (headerHeight + idx * 40 + 20);
          
          if (isTargetCommit) {
            console.log('GitTree: Using fallback position for 3ad0351', { x, y, lane, isOnMainLine });
          }
        }
        
        // Determine color based on lane assignment (not just branch refs)
        let color = '#3b82f6'; // Default blue for main
        
        if (node && !node.isOnMainLine && node.lane > 0) {
          // Find color by lane for branch commits
          let foundColor = false;
          for (const [branchName, branchColor] of branchColors.entries()) {
            if (branchColor.lane === node.lane) {
              color = branchColor.color;
              foundColor = true;
              if (isTargetCommit) {
                console.log(`GitTree: Found color for 3ad0351 by lane ${node.lane}:`, { branchName, color: branchColor.color, lane: branchColor.lane });
              }
              break;
            }
          }
          if (!foundColor && isTargetCommit) {
            console.warn(`GitTree: No color found for 3ad0351 lane ${node.lane}. Available branchColors:`, 
              Array.from(branchColors.entries()).map(([name, bc]) => ({ name, lane: bc.lane, color: bc.color }))
            );
          }
        } else if (branchRefs.length > 0) {
          // Fallback: use branch refs if available
          const branchColor = branchColors.get(branchRefs[0]);
          color = branchColor?.color || color;
        }

        if (isTargetCommit) {
          console.log('GitTree: Final dot props for 3ad0351', { 
            x, 
            y, 
            color, 
            dotRadius,
            nodeLane: node?.lane,
            nodeIsOnMainLine: node?.isOnMainLine,
            calculatedLane: node?.lane ?? 0,
            calculatedIsOnMainLine: node?.isOnMainLine ?? true,
            branchColorsEntries: Array.from(branchColors.entries()).map(([name, bc]) => ({ name, lane: bc.lane, color: bc.color })),
          });
        }

        // Always render the dot - no conditions
        return (
          <circle
            key={`dot-${commit.commit}`}
            cx={x}
            cy={y}
            r={dotRadius}
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}
