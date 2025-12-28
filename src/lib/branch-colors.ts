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

  for (const ref of refsList) {
    if (ref === 'HEAD' || ref.endsWith(' -> HEAD')) {
      continue;
    }

    if (ref.includes(' -> ')) {
      const branchName = ref.split(' -> ')[1].trim();
      if (branchName && branchName !== 'HEAD' && !branchName.includes('/')) {
        branches.push(branchName);
      }
    } else if (!ref.includes('/')) {
      branches.push(ref);
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
  
  // Process commits in order (matching GitTree's logic)
  // GitTree assigns colors based on branchColors.size when first encountered
  let branchCount = 0; // Count of non-main branches
  
  commits.forEach((commit) => {
    const branchRefs = parseBranchRefs(commit.refs);
    
    if (branchRefs.length > 0) {
      const primaryBranch = branchRefs[0]; // Use first branch (matching GitTree)
      
      if (!branchColorMap.has(primaryBranch)) {
        if (primaryBranch === mainBranch) {
          branchColorMap.set(primaryBranch, BRANCH_COLORS[0]); // Blue for main
        } else {
          // Match GitTree logic: (branchColors.size % (BRANCH_COLORS.length - 1)) + 1
          const colorIndex = (branchCount % (BRANCH_COLORS.length - 1)) + 1;
          branchColorMap.set(primaryBranch, BRANCH_COLORS[colorIndex]);
          branchCount++;
        }
      }
    }
  });
  
  return branchColorMap;
}

