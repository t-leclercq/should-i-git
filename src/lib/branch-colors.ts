// Predefined colors for branches
export const BRANCH_COLORS = [
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
 * Get color for a branch name
 * Main branch gets blue (#3b82f6), other branches get colors in order
 */
export function getBranchColor(branchName: string, branchIndex: number = 0): string {
  if (branchName === 'main' || branchName === 'master') {
    return BRANCH_COLORS[0]; // Blue for main
  }
  
  // Other branches: skip index 0 (main), use colors starting from index 1
  const colorIndex = (branchIndex % (BRANCH_COLORS.length - 1)) + 1;
  return BRANCH_COLORS[colorIndex];
}

/**
 * Parse refs to extract branch names (local branches only, matching GitTree logic)
 * Handles remote branches by stripping "origin/" prefix
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
 * Create a map of branch names to colors based on commit refs
 * Matches the logic used in GitTree component - assigns colors in order of first appearance
 */
export function createBranchColorMap(commits: Array<{ refs: string }>): Map<string, string> {
  const branchColorMap = new Map<string, string>();
  
  // Identify main branch first
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
  
  // Process commits in REVERSE order (newest first) to match GitTree's logic exactly
  // GitTree processes commits in reverse order and assigns colors based on branchColors.size when first encountered
  const commitsReversed = [...commits].reverse();
  
  commitsReversed.forEach((commit) => {
    const branchRefs = parseBranchRefs(commit.refs);
    
    if (branchRefs.length > 0) {
      const primaryBranch = branchRefs[0]; // Use first branch (matching GitTree)
      
      if (!branchColorMap.has(primaryBranch)) {
        if (primaryBranch === mainBranch) {
          branchColorMap.set(primaryBranch, BRANCH_COLORS[0]); // Blue for main
          console.log(`branch-colors: Assigned ${primaryBranch} -> ${BRANCH_COLORS[0]} (main, index 0)`);
        } else {
          // Match GitTree logic exactly: (branchColors.size % (BRANCH_COLORS.length - 1)) + 1
          // where branchColors.size is the number of branches already assigned (including main)
          const colorIndex = (branchColorMap.size % (BRANCH_COLORS.length - 1)) + 1;
          const color = BRANCH_COLORS[colorIndex];
          branchColorMap.set(primaryBranch, color);
          console.log(`branch-colors: Assigned ${primaryBranch} -> ${color} (index ${colorIndex}, branchColorMap.size=${branchColorMap.size})`);
        }
      }
    }
  });
  
  console.log('branch-colors: Final branchColorMap:', Array.from(branchColorMap.entries()));
  
  return branchColorMap;
}

