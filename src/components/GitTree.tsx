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

    // Check if on main line
    if (mainLineCommits.has(commit.commit)) {
      commitToLane.set(commit.commit, 0);
      node.lane = 0;
      node.isOnMainLine = true;
      return;
    }

    // Trace back to find branch assignment
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

  return { nodes, branchColors, mainLineCommits };
}

export function GitTree({ allCommits, totalRows, rowPositions, headerHeight, totalHeight, width }: GitTreeProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [treeData, setTreeData] = React.useState<{
    nodes: Map<string, CommitNode>;
    branchColors: Map<string, BranchColor>;
    mainLineCommits: Set<string>;
  } | null>(null);

  React.useEffect(() => {
    if (allCommits.length === 0) {
      setTreeData(null);
      return;
    }

    const data = buildTreeStructure(allCommits);
    setTreeData(data);
  }, [allCommits]);

  if (!treeData || allCommits.length === 0 || rowPositions.length === 0) {
    return <div style={{ width, height: headerHeight + totalRows * 40 }} />;
  }

  const { nodes, branchColors } = treeData;
  const commits = allCommits;
  const laneWidth = 16;
  const dotRadius = 3.5;
  const centerX = width / 2;
  const mainLineX = centerX;

  // Calculate positions for all commits using measured row positions
  const commitPositions = commits.map((commit, index) => {
    const node = nodes.get(commit.commit);
    const lane = node?.lane ?? 0;
    const isOnMainLine = node?.isOnMainLine ?? true;
    
    // Main line commits stay centered, branch commits offset
    const x = isOnMainLine ? mainLineX : mainLineX + (lane > 0 ? laneWidth : -laneWidth) * lane;
    
    // Use the measured Y position for this row (center of the row)
    const y = rowPositions[index] ?? (headerHeight + index * 40 + 20);
    
    return { commit: commit.commit, x, y, lane, index, isOnMainLine };
  });

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

      const node = nodes.get(current);
      if (!node) continue;

      const parents = node.parent.split(' ').filter(p => p.trim());
      for (const parent of parents) {
        if (!visited.has(parent) && nodes.has(parent)) {
          visited.add(parent);
          queue.push(parent);
        }
      }
    }

    return null;
  };

  // Build paths for connections
  const paths: Array<{
    from: { x: number; y: number; lane: number; index: number; isOnMainLine: boolean };
    to: { x: number; y: number; lane: number; index: number; isOnMainLine: boolean };
    branch: string;
    color: string;
  }> = [];

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

        paths.push({
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
  commits.forEach((commit) => {
    const node = nodes.get(commit.commit);
    if (!node || node.isOnMainLine) return; // Skip main line commits

    const branchRefs = node.branchRefs;
    if (branchRefs.length === 0) return;

    const branchName = branchRefs[0];
    if (processedBranches.has(branchName)) return; // Already processed this branch

    // Find the tip of this branch (the commit with this branch ref that's highest in the list)
    let branchTipIndex = -1;
    let branchTipCommit: typeof commits[0] | null = null;
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const cNode = nodes.get(c.commit);
      if (cNode && parseBranchRefs(c.refs).includes(branchName)) {
        branchTipIndex = i;
        branchTipCommit = c;
        break; // Found the tip (newest commit with this branch)
      }
    }

    if (!branchTipCommit || branchTipIndex === -1) return;

    // Find common ancestor (where branch diverged from main)
    const commonAncestorHash = findCommonAncestor(branchTipCommit.commit, treeData.mainLineCommits);
    if (!commonAncestorHash) return;

    const commonAncestorIndex = commits.findIndex(c => c.commit === commonAncestorHash);
    if (commonAncestorIndex === -1) return;

    const branchTipPos = commitPositions[branchTipIndex];
    const commonAncestorPos = commitPositions[commonAncestorIndex];

    // Get branch color
    const branchColor = branchColors.get(branchName);
    const color = branchColor?.color || '#3b82f6';

    // Draw branch line from common ancestor to branch tip
    paths.push({
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
        paths.push({
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

      {/* Draw commit dots */}
      {commitPositions.map((pos, idx) => {
        const commit = commits[idx];
        const node = nodes.get(commit.commit);
        const branchRefs = node?.branchRefs || [];
        
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

        return (
          <circle
            key={`dot-${commit.commit}`}
            cx={pos.x}
            cy={pos.y}
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
