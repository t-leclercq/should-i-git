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

  // Build paths for connections
  const paths: Array<{
    from: { x: number; y: number; lane: number; index: number; isOnMainLine: boolean };
    to: { x: number; y: number; lane: number; index: number; isOnMainLine: boolean };
    branch: string;
    color: string;
  }> = [];

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
    });
  });

  // Use the measured total height
  const svgHeight = totalHeight;

  // Get first and last row Y positions for main line
  const firstRowY = rowPositions[0] ?? (headerHeight + 20);
  const lastRowY = rowPositions[rowPositions.length - 1] ?? (headerHeight + (totalRows - 1) * 40 + 20);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={svgHeight}
      style={{ display: 'block' }}
      className="absolute top-0 left-0"
    >
      {/* Draw main vertical line */}
      {commits.length > 1 && (
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
          // Rounded 90° corner: horizontal from source dot, then vertical to bottom of target dot
          const cornerRadius = 8;
          
          // Determine direction
          const goingRight = to.x > from.x;
          const goingDown = to.y > from.y; // Parent is below (larger Y)
          
          // Target Y: bottom of the target dot
          // If going down, target is below, so add dotRadius
          // If going up, target is above, so subtract dotRadius
          const targetY = goingDown ? to.y + dotRadius : to.y - dotRadius;
          
          // Corner point: where horizontal and vertical lines meet
          const cornerX = to.x;
          const cornerY = from.y;
          
          // Calculate points for the rounded corner
          // Horizontal line ends just before the corner
          const horizontalEndX = goingRight 
            ? cornerX - cornerRadius 
            : cornerX + cornerRadius;
          
          // Vertical line starts just after the corner
          const verticalStartY = goingDown 
            ? cornerY + cornerRadius 
            : cornerY - cornerRadius;
          
          // Arc sweep flag for rounded 90° corner
          // Right-then-down: clockwise (1)
          // Left-then-down: counter-clockwise (0)  
          // Right-then-up: counter-clockwise (0)
          // Left-then-up: clockwise (1)
          const arcSweepFlag = (goingRight && goingDown) || (!goingRight && !goingDown) ? 1 : 0;
          
          // Build the path: horizontal line -> rounded corner (arc) -> vertical line to bottom of dot
          const pathData = `M ${from.x} ${from.y} L ${horizontalEndX} ${from.y} A ${cornerRadius} ${cornerRadius} 0 0 ${arcSweepFlag} ${cornerX} ${verticalStartY} L ${to.x} ${targetY}`;
          
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
        
        // Determine color
        let color = '#3b82f6'; // Default blue for main
        if (branchRefs.length > 0) {
          const branchColor = branchColors.get(branchRefs[0]);
          color = branchColor?.color || color;
        } else if (node && !node.isOnMainLine) {
          // Find color by lane
          const lane = node.lane;
          for (const [, branchColor] of branchColors.entries()) {
            if (branchColor.lane === lane) {
              color = branchColor.color;
              break;
            }
          }
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
