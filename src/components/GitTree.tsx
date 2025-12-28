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

  // If no main/master found, use the first branch or default to first commit's branch
  if (!mainBranch && commits.length > 0) {
    const firstRefs = parseBranchRefs(commits[0].refs);
    mainBranch = firstRefs[0] || null;
  }

  // First, build a map of commits that are part of non-main branches
  // This includes both descendants (children) AND ancestors (parents) of branch tips
  // This helps us exclude commits that are part of feature branches even if they don't have branch refs
  const branchDescendants = new Set<string>();
  
  // First pass: identify branch tips and trace forward (children)
  commits.forEach(commit => {
    const branchRefs = parseBranchRefs(commit.refs);
    // If this commit has a non-main branch ref, trace forward to mark all descendants
    if (branchRefs.length > 0 && !branchRefs.includes(mainBranch || '') && !branchRefs.includes('master')) {
      const visited = new Set<string>();
      const queue: string[] = [commit.commit];
      visited.add(commit.commit);
      branchDescendants.add(commit.commit);
      
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
          }
        });
      }
    }
  });
  
  // Second pass: trace backward from branch tips to mark ancestors
  // Only mark commits on the direct path from branch tip to common ancestor
  // We'll use a helper function similar to findCommonAncestor to identify when we hit main line
  commits.forEach(commit => {
    const branchRefs = parseBranchRefs(commit.refs);
    if (branchRefs.length > 0 && !branchRefs.includes(mainBranch || '') && !branchRefs.includes('master')) {
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
              continue; // Stop here, this is the common ancestor
            }
            
            backwardVisited.add(parent);
            backwardQueue.push(parent);
            branchDescendants.add(parent);
          }
        }
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
    // No main branch found - mark all commits as main line
    commits.forEach(c => mainLineCommits.add(c.commit));
  }

  // Assign lanes to branch tips
  commits.forEach((commit) => {
    const branchRefs = parseBranchRefs(commit.refs);
    
    if (branchRefs.length > 0) {
      const primaryBranch = branchRefs[0];
      
      // Main branch stays on lane 0
      if (primaryBranch === mainBranch) {
        commitToLane.set(commit.commit, 0);
        commitToBranch.set(commit.commit, primaryBranch);
        const node = nodes.get(commit.commit)!;
        node.lane = 0;
        node.isOnMainLine = true;
      } else {
        // Other branches get their own lanes
        if (!branchColors.has(primaryBranch)) {
          const colorIndex = (branchColors.size % (BRANCH_COLORS.length - 1)) + 1; // Skip index 0 (main)
          branchColors.set(primaryBranch, {
            branch: primaryBranch,
            color: BRANCH_COLORS[colorIndex],
            lane: nextLane++,
          });
        }
        
        const branchColor = branchColors.get(primaryBranch)!;
        commitToLane.set(commit.commit, branchColor.lane);
        commitToBranch.set(commit.commit, primaryBranch);
        const node = nodes.get(commit.commit)!;
        node.lane = branchColor.lane;
        node.isOnMainLine = false;
      }
    }
  });

  // Propagate lanes backwards through history
  commits.forEach((commit) => {
    const node = nodes.get(commit.commit)!;
    
    if (commitToLane.has(commit.commit)) {
      return; // Already assigned
    }

    // Check if on main line - but ONLY if it's not a branch descendant
    if (mainLineCommits.has(commit.commit) && !branchDescendants.has(commit.commit)) {
      commitToLane.set(commit.commit, 0);
      node.lane = 0;
      node.isOnMainLine = true;
      return;
    }

    // If it's a branch descendant but not assigned yet, find branch assignment
    if (branchDescendants.has(commit.commit)) {
      // First, try tracing forward (to children) to find the branch tip
      // This handles cases where the commit is an ancestor of the branch tip
      const forwardVisited = new Set<string>();
      const forwardQueue: string[] = [commit.commit];
      forwardVisited.add(commit.commit);
      let foundLane: number | null = null;
      let foundBranch: string | null = null;

      // Trace forward to find commits with assigned lanes (branch tips)
      while (forwardQueue.length > 0 && foundLane === null) {
        const current = forwardQueue.shift()!;
        
        if (commitToLane.has(current)) {
          const lane = commitToLane.get(current)!;
          if (lane > 0) {
            // Found a branch lane
            foundLane = lane;
            foundBranch = commitToBranch.get(current) || null;
            break;
          }
        }

        // Find children (commits that have current as a parent)
        commits.forEach(c => {
          const cParents = c.parent.split(' ').filter(p => p.trim());
          if (cParents.includes(current) && !forwardVisited.has(c.commit)) {
            forwardVisited.add(c.commit);
            forwardQueue.push(c.commit);
          }
        });
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
    }

    // Trace back to find branch assignment (for commits not in branchDescendants)
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
    } else {
      // Default to main line
      commitToLane.set(commit.commit, 0);
      node.lane = 0;
      node.isOnMainLine = true;
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
          for (const [, branchColor] of branchColors.entries()) {
            if (branchColor.lane === node.lane) {
              color = branchColor.color;
              break;
            }
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
