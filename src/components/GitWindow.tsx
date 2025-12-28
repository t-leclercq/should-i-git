import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createBranchColorMap } from "@/lib/branch-colors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { GitTree } from "@/components/GitTree";

// Types matching the backend API
interface GitCommit {
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

interface GitBranch {
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

interface GitTag {
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
 * Parse refs string to extract branch names
 * Example: "HEAD -> main, origin/main, origin/HEAD" -> ["main", "origin/main"]
 * @param refs - The refs string from git
 * @param hideRemoteBranches - If true, filters out remote branches (origin/*) and prefers local branches when both exist
 */
function parseBranchRefs(refs: string, hideRemoteBranches: boolean = true): string[] {
  if (!refs || !refs.trim()) {
    return [];
  }

  // Split by comma and clean up each ref
  const refsList = refs
    .split(',')
    .map(ref => ref.trim())
    .filter(ref => ref.length > 0);

  const branches: string[] = [];

  for (const ref of refsList) {
    // Skip HEAD references
    if (ref === 'HEAD' || ref.endsWith(' -> HEAD')) {
      continue;
    }

    let branchName: string | null = null;

    // Handle "HEAD -> branch" format
    if (ref.includes(' -> ')) {
      branchName = ref.split(' -> ')[1].trim();
      if (branchName === 'HEAD') {
        continue;
      }
    } else {
      // Regular branch reference
      branchName = ref;
    }

    if (!branchName) continue;

    // Skip remote branches if hideRemoteBranches is true
    // This automatically prefers local branches when both exist
    // (e.g., if both "main" and "origin/main" exist, only "main" is added)
    if (hideRemoteBranches && branchName.startsWith('origin/')) {
      continue;
    }

    branches.push(branchName);
  }

  // Remove duplicates and sort
  return [...new Set(branches)].sort();
}

interface GitWindowProps {
  hideRemoteBranches?: boolean;
}

export function GitWindow(props: GitWindowProps = {}) {
  const { hideRemoteBranches = true } = props;
  const [activeTab, setActiveTab] = React.useState<"commits" | "branches" | "tags">("commits");
  const [commits, setCommits] = React.useState<GitCommit[]>([]);
  const [branches, setBranches] = React.useState<GitBranch[]>([]);
  const [tags, setTags] = React.useState<GitTag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = React.useState<number>(40);
  const [rowPositions, setRowPositions] = React.useState<number[]>([]);
  const [totalTableHeight, setTotalTableHeight] = React.useState<number>(0);
  
  // Create branch color map from commits
  const branchColorMap = React.useMemo(() => {
    return createBranchColorMap(commits);
  }, [commits]);

  // Measure table dimensions after render
  React.useEffect(() => {
    const measureDimensions = () => {
      // Find the header row using data attribute
      const headerRow = document.querySelector('[data-header-row]') as HTMLTableRowElement;
      let headerHeight = 40;
      if (headerRow) {
        headerHeight = headerRow.offsetHeight;
        setMeasuredHeaderHeight(headerHeight);
      }
      
      // Find all data rows and measure each one
      const rows = document.querySelectorAll('[data-commit-row]') as NodeListOf<HTMLTableRowElement>;
      if (rows.length > 0) {
        const positions: number[] = [];
        let cumulativeY = headerHeight;
        
        rows.forEach((row) => {
          const rowHeight = row.offsetHeight;
          // Center of the row is at cumulativeY + half of row height
          positions.push(cumulativeY + rowHeight / 2);
          cumulativeY += rowHeight;
        });
        
        setRowPositions(positions);
        // Total height is the cumulative Y (which is after the last row)
        setTotalTableHeight(cumulativeY);
      }
    };

    // Measure immediately and after a short delay to ensure DOM is fully rendered
    measureDimensions();
    const timeoutId = setTimeout(measureDimensions, 0);
    
    return () => clearTimeout(timeoutId);
  }, [commits.length]); // Re-measure when commits change

  const fetchCommits = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch commits from all branches to get branch information
      const response = await fetch("/api/commits?maxCount=50&all=true");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data: GitCommit[] = await response.json();
      setCommits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      console.error("Error fetching commits:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBranches = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/branches?all=true");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data: GitBranch[] = await response.json();
      setBranches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch branches");
      console.error("Error fetching branches:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tags?sort=true");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data: GitTag[] = await response.json();
      setTags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tags");
      console.error("Error fetching tags:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFetch = React.useCallback(() => {
    switch (activeTab) {
      case "commits":
        fetchCommits();
        break;
      case "branches":
        fetchBranches();
        break;
      case "tags":
        fetchTags();
        break;
    }
  }, [activeTab, fetchCommits, fetchBranches, fetchTags]);

  return (
    <div className="w-full p-6 space-y-4">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="commits">Commits</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>
          <Button onClick={handleFetch} disabled={loading}>
            {loading ? "Loading..." : "Fetch Data"}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
            {error}
          </div>
        )}

        <TabsContent value="commits">
          <div className="border rounded-lg relative">
            {commits.length > 0 && rowPositions.length === commits.length && totalTableHeight > 0 && (
              <div 
                className="absolute left-0 top-0 w-[80px] pointer-events-none z-10"
                style={{ height: `${totalTableHeight}px` }}
              >
                <GitTree
                  allCommits={commits}
                  totalRows={commits.length}
                  rowPositions={rowPositions}
                  headerHeight={measuredHeaderHeight}
                  totalHeight={totalTableHeight}
                  width={80}
                />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow data-header-row>
                  <TableHead className="w-[80px]">Tree</TableHead>
                  <TableHead className="w-[100px]">Commit</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading commits..." : "No commits fetched. Click 'Fetch Data' to load commits."}
                    </TableCell>
                  </TableRow>
                ) : (
                  commits.map((commit, index) => {
                    const branchRefs = parseBranchRefs(commit.refs, hideRemoteBranches);
                    return (
                      <TableRow key={commit.commit} data-commit-row>
                        <TableCell className="p-0" style={{ height: '40px', width: '80px' }} />
                        <TableCell className="font-mono text-xs">
                          <div className="flex flex-col gap-1">
                            <span>{commit.abbreviated_commit}</span>
                            {branchRefs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {branchRefs.map((branch) => {
                                  const branchColor = branchColorMap.get(branch) || '#3b82f6';
                                  return (
                                    <Badge
                                      key={branch}
                                      variant="outline"
                                      className="text-[0.625rem] px-1.5 py-0"
                                      style={{
                                        borderColor: branchColor,
                                        color: branchColor,
                                      }}
                                    >
                                      {branch}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{commit.author.name}</div>
                            <div className="text-xs text-muted-foreground">{commit.author.email}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(commit.author.date).toLocaleString()}
                        </TableCell>
                        <TableCell>{commit.subject}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="branches">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Branch</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading branches..." : "No branches fetched. Click 'Fetch Data' to load branches."}
                    </TableCell>
                  </TableRow>
                ) : (
                  branches.map((branch) => (
                    <TableRow key={branch.name}>
                      <TableCell>
                        <span className="font-medium">{branch.name}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {branch.abbreviated_commit}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{branch.author.name}</div>
                          <div className="text-xs text-muted-foreground">{branch.author.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{branch.subject}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="tags">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Tag</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading tags..." : "No tags fetched. Click 'Fetch Data' to load tags."}
                    </TableCell>
                  </TableRow>
                ) : (
                  tags.map((tag) => (
                    <TableRow key={tag.name}>
                      <TableCell className="font-medium">{tag.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {tag.abbreviated_commit}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{tag.author.name}</div>
                          <div className="text-xs text-muted-foreground">{tag.author.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{tag.subject}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

