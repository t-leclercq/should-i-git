import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { GitTree } from "@/components/GitTree";
import { FlaskConical, Check } from "lucide-react";
import { MessageDialog } from "@/components/MessageDialog";
import { DiffDialog } from "@/components/DiffDialog";

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
  
  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const commitsPerPage = 25;
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedAction, setSelectedAction] = React.useState<"late" | "ready" | "mistake" | "rollback" | null>(null);
  const [isProceeding, setIsProceeding] = React.useState(false);
  
  // Message dialog state
  const [messageDialogOpen, setMessageDialogOpen] = React.useState(false);
  const [messageDialogContent, setMessageDialogContent] = React.useState<React.ReactNode[]>([]);
  const [shouldShowDiff, setShouldShowDiff] = React.useState(false);
  
  // Diff dialog state
  const [diffDialogOpen, setDiffDialogOpen] = React.useState(false);
  
  // Fake merge commit state
  const [showFakeMergeCommit, setShowFakeMergeCommit] = React.useState(false);
  
  // Reset effect state (remove 876369a and add main badge to ba78722)
  const [showResetEffect, setShowResetEffect] = React.useState(false);
  const [treeRemountKey, setTreeRemountKey] = React.useState(0);
  
  // Action states
  const [sameFilesChanged, setSameFilesChanged] = React.useState(false);
  
  // Handle proceed action
  const handleProceed = React.useCallback(() => {
    setIsProceeding(true);
    
    // Capture the selected action and checkbox state before resetting
    const action = selectedAction;
    const hasSameFilesChanged = sameFilesChanged;
    
    // Close drawer first with confirmation animation
    setTimeout(() => {
      setIsProceeding(false);
      setSelectedAction(null);
      setSameFilesChanged(false);
      setDrawerOpen(false);
      
      // Show message dialog after drawer closes based on selected action
      if (action === "late") {
        // Small delay to ensure drawer is fully closed
        setTimeout(() => {
          const messages: React.ReactNode[] = hasSameFilesChanged
            ? [
                "It is recommended to interactively rebase your work on top of the stable branch.",
                <div key="interactive-steps">
                  <p className="mb-3">This is done in 2 steps :</p>
                  <div className="space-y-2">
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git checkout feature-branch</code></pre>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git rebase -i main</code></pre>
                  </div>
                </div>,
                "It means you will be shown each merge conflict between your changes and the stable branch changes, to be able to decide which change is kept or merged together."
              ]
            : [
                "You should rebase your work on top of the stable branch",
                <div key="steps">
                  <p className="mb-3">This is done in 2 steps :</p>
                  <div className="space-y-2">
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git checkout feature-branch</code></pre>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git rebase main</code></pre>
                  </div>
                </div>,
                "It means putting the stable branch's latest changes first, then your feature changes on top of them."
              ];
          
          // Set flag to show diff dialog when "Show me!" is clicked (only for interactive rebase)
          setShouldShowDiff(hasSameFilesChanged);
          setMessageDialogContent(messages);
          setMessageDialogOpen(true);
        }, 300); // Small delay after drawer closes
      } else if (action === "ready") {
        // Small delay to ensure drawer is fully closed
        setTimeout(() => {
          const messages: React.ReactNode[] = [
            <div key="merge-steps">
              <p className="mb-3">You are ready to merge your branch ! This is done in two steps :</p>
              <div className="space-y-2">
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git checkout master</code></pre>
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git merge feature-branch</code></pre>
              </div>
            </div>
          ];
          
          setMessageDialogContent(messages);
          setMessageDialogOpen(true);
        }, 300); // Small delay after drawer closes
      } else if (action === "mistake") {
        // Small delay to ensure drawer is fully closed
        setTimeout(() => {
          const messages: React.ReactNode[] = [
            "You should reset your branch to a previous commit",
            <div key="reset-steps">
              <p className="mb-3">This is done in two steps:</p>
              <div className="space-y-2">
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git reset --hard yourGoodCommitSHA</code></pre>
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git push --force</code></pre>
              </div>
            </div>,
            "It will reset your branch to an earlier state, and by force-pushing, you'll update the branch to that previous version."
          ];
          
          setMessageDialogContent(messages);
          setMessageDialogOpen(true);
          // Set flag to show reset effect when "Show me!" is clicked
          setShowResetEffect(true);
          setTreeRemountKey(prev => prev + 1); // Force tree remount
        }, 300); // Small delay after drawer closes
      } else if (action === "rollback") {
        // Small delay to ensure drawer is fully closed
        setTimeout(() => {
          const messages: React.ReactNode[] = [
            "You should revert your changes",
            <div key="revert-steps">
              <p className="mb-3">This is done in three steps:</p>
              <div className="space-y-2">
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git revert yourGoodCommitSHA</code></pre>
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git commit -m "Rollback to version x.y.z"</code></pre>
                <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git push</code></pre>
              </div>
            </div>,
            "It creates a commit that rolls the project back to a previous state."
          ];
          
          setMessageDialogContent(messages);
          setMessageDialogOpen(true);
        }, 300); // Small delay after drawer closes
      }
    }, 1500); // 1.5 second animation
  }, [selectedAction, sameFilesChanged]);
  
  // Reset selection when drawer closes
  React.useEffect(() => {
    if (!drawerOpen) {
      setSelectedAction(null);
      setIsProceeding(false);
      setSameFilesChanged(false);
    }
  }, [drawerOpen]);
  
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = React.useState<number>(40);
  const [rowPositions, setRowPositions] = React.useState<number[]>([]);
  const [totalTableHeight, setTotalTableHeight] = React.useState<number>(0);
  
  // Create branch color map from commits
  const branchColorMap = React.useMemo(() => {
    return createBranchColorMap(commits);
  }, [commits]);
  
  // Pagination calculations
  const totalPages = Math.ceil(commits.length / commitsPerPage);
  const paginatedCommits = React.useMemo(() => {
    const startIndex = (currentPage - 1) * commitsPerPage;
    const endIndex = startIndex + commitsPerPage;
    return commits.slice(startIndex, endIndex);
  }, [commits, currentPage]);
  
  // Reset to page 1 when commits change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [commits.length]);

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

    // Measure immediately and after delays to ensure DOM is fully rendered
    measureDimensions();
    const timeoutId1 = setTimeout(measureDimensions, 0);
    const timeoutId2 = setTimeout(measureDimensions, 50); // Additional delay for DOM updates
    const timeoutId3 = setTimeout(measureDimensions, 100); // Another delay for complex updates
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [paginatedCommits.length, currentPage, showResetEffect, showFakeMergeCommit]); // Re-measure when commits are filtered

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
            {(() => {
              // Debug: log showFakeMergeCommit state
              console.log('showFakeMergeCommit:', showFakeMergeCommit);
              
              // Start with all commits - create new array to ensure reference changes
              let commitsForTree = paginatedCommits.map(c => ({
                commit: c.commit,
                parent: c.parent,
                refs: c.refs,
              }));
              
              // Debug: log commits before filtering
              console.log('commitsForTree before filtering:', commitsForTree.length, commitsForTree.map(c => c.commit.substring(0, 7)));
              
              // Filter out feature-branch commits from tree when fake merge commit is shown
              if (showFakeMergeCommit) {
                commitsForTree = commitsForTree.filter(c => {
                  const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                  const shouldInclude = !branchRefs.includes("feature-branch");
                  if (!shouldInclude) {
                    console.log('Filtering out commit:', c.commit.substring(0, 7), 'branchRefs:', branchRefs);
                  }
                  return shouldInclude;
                });
              }
              
              // Debug: log commits after filtering
              console.log('commitsForTree after filtering:', commitsForTree.length, commitsForTree.map(c => c.commit.substring(0, 7)));
              console.log('3ad0351 in commitsForTree?', commitsForTree.some(c => c.commit.includes('3ad0351')));
              
              // Remove commit 876369a when reset effect is shown
              // Note: We only remove 876369a, feature-branch commits should still be visible
              if (showResetEffect) {
                const commitToRemove = paginatedCommits.find(pc => pc.abbreviated_commit === "876369a");
                if (commitToRemove) {
                  commitsForTree = commitsForTree.filter(c => c.commit !== commitToRemove.commit);
                  // Update parent references: if any commit has 876369a as a parent, update it to point to 876369a's parent
                  const removedCommitHash = commitToRemove.commit;
                  const removedCommitParent = commitToRemove.parent.split(' ').filter(p => p.trim())[0]; // First parent
                  commitsForTree = commitsForTree.map(c => {
                    // If this commit's parent is the removed commit, update it to point to the removed commit's parent
                    const parents = c.parent.split(' ').filter(p => p.trim());
                    if (parents.includes(removedCommitHash)) {
                      // Replace the removed commit with its parent
                      const updatedParents = parents.map(p => p === removedCommitHash ? removedCommitParent : p).filter(p => p);
                      return {
                        ...c,
                        parent: updatedParents.join(' '),
                      };
                    }
                    return c;
                  });
                }
              }
              
              // Check if we should render the tree
              const shouldRenderTree = paginatedCommits.length > 0 && 
                rowPositions.length > 0 && 
                totalTableHeight > 0 &&
                commitsForTree.length > 0;
              
              if (!shouldRenderTree) {
                return null;
              }
              
              // Adjust row positions if we filtered commits
              let treeRowPositions = rowPositions;
              if ((showFakeMergeCommit || showResetEffect) && commitsForTree.length !== paginatedCommits.length) {
                // Recalculate positions for filtered commits
                const filteredIndices: number[] = [];
                paginatedCommits.forEach((c, idx) => {
                  if (showFakeMergeCommit) {
                    const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                    if (branchRefs.includes("feature-branch")) {
                      return; // Skip feature-branch commits
                    }
                  }
                  if (showResetEffect && c.abbreviated_commit === "876369a") {
                    return; // Skip 876369a commit
                  }
                  filteredIndices.push(idx);
                });
                treeRowPositions = filteredIndices.map(idx => rowPositions[idx]);
              }
              
              // Ensure rowPositions length matches commitsForTree length
              if (treeRowPositions.length !== commitsForTree.length) {
                // If lengths don't match, use the first N positions where N is commitsForTree.length
                treeRowPositions = treeRowPositions.slice(0, commitsForTree.length);
              }
              
              // Create a key that changes when commits are filtered to force re-render
              // Include parent hashes to detect parent reference changes
              // Use remount key to force complete remount when reset effect is triggered
              const treeKey = `tree-${commitsForTree.length}-${showResetEffect}-${showFakeMergeCommit}-${treeRemountKey}-${commitsForTree.map(c => `${c.commit.substring(0,7)}:${c.parent.substring(0,7)}`).join('|')}`;
              
              // Create a new array reference to ensure React detects the change
              const commitsForTreeRef = commitsForTree.map(c => ({ ...c }));
              
              return (
                <div 
                  className="absolute left-0 top-0 w-[80px] pointer-events-none z-10"
                  style={{ height: `${totalTableHeight}px` }}
                  key={treeKey}
                >
                  <GitTree
                    key={treeKey}
                    allCommits={commitsForTreeRef}
                    totalRows={commitsForTreeRef.length}
                    rowPositions={treeRowPositions}
                    headerHeight={measuredHeaderHeight}
                    totalHeight={totalTableHeight}
                    width={80}
                  />
                </div>
              );
            })()}
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
                {paginatedCommits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading commits..." : "No commits fetched. Click 'Fetch Data' to load commits."}
                    </TableCell>
                  </TableRow>
                ) : (
                  (() => {
                    const commitsToRender = [...paginatedCommits];
                    // Find index of commit 876369a and insert fake merge commit above it if needed
                    const targetCommitIndex = commitsToRender.findIndex(c => c.abbreviated_commit === "876369a");
                    if (showFakeMergeCommit && targetCommitIndex !== -1) {
                      const fakeMergeCommit: GitCommit = {
                        commit: "fake-merge-commit",
                        abbreviated_commit: "abc1234",
                        tree: "",
                        abbreviated_tree: "",
                        parent: "",
                        abbreviated_parent: "",
                        refs: "HEAD -> main",
                        encoding: "",
                        subject: "Merge: Resolved conflicts between feature-branch and main",
                        sanitized_subject_line: "",
                        body: "",
                        commit_notes: "",
                        verification_flag: "",
                        signer: "",
                        signer_key: "",
                        author: {
                          name: "Merge Bot",
                          email: "merge@example.com",
                          date: new Date().toISOString(),
                        },
                        commiter: {
                          name: "Merge Bot",
                          email: "merge@example.com",
                          date: new Date().toISOString(),
                        },
                      };
                      commitsToRender.splice(targetCommitIndex, 0, fakeMergeCommit);
                    }
                    
                    // Remove commit 876369a when reset effect is shown
                    if (showResetEffect) {
                      const resetTargetIndex = commitsToRender.findIndex(c => c.abbreviated_commit === "876369a");
                      if (resetTargetIndex !== -1) {
                        commitsToRender.splice(resetTargetIndex, 1);
                      }
                    }
                    
                    return commitsToRender.map((commit) => {
                      const isFakeMerge = commit.commit === "fake-merge-commit";
                      const is876369a = commit.abbreviated_commit === "876369a";
                      const isBa78722 = commit.abbreviated_commit === "ba78722";
                      // Filter branch refs based on conditions
                      let branchRefs = parseBranchRefs(commit.refs, hideRemoteBranches);
                      if (showFakeMergeCommit) {
                        // Remove feature-branch from all commits when fake merge is shown
                        branchRefs = branchRefs.filter(branch => branch !== "feature-branch");
                        // Remove "main" from 876369a only when fake merge commit is placed above it
                        if (is876369a) {
                          branchRefs = branchRefs.filter(branch => branch !== "main");
                        }
                      }
                      // Add "main" badge to ba78722 when reset effect is shown
                      if (showResetEffect && isBa78722 && !branchRefs.includes("main")) {
                        branchRefs = [...branchRefs, "main"];
                      }
                      return (
                        <TableRow 
                          key={commit.commit} 
                          data-commit-row
                          className={isFakeMerge ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                        >
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
                    });
                  })()
                )}
              </TableBody>
            </Table>
          </div>
          {commits.length > commitsPerPage && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                        }}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                      }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
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
      
      {/* Floating Action Button */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger asChild>
          <Button
            className="fixed bottom-6 left-6 h-14 px-6 rounded-full shadow-lg z-50 flex items-center gap-2"
          >
            <FlaskConical className="h-6 w-6" />
            <span>Should i git?</span>
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <div className="mx-auto w-full max-w-2xl">
            <DrawerHeader>
              <DrawerTitle>Branch Situations</DrawerTitle>
              <DrawerDescription>Select an situation you are in</DrawerDescription>
            </DrawerHeader>
            <div className="p-4 space-y-4">
              <Carousel className="w-full">
                <CarouselContent>
                  <CarouselItem>
                    <div 
                      className={`p-6 border rounded-lg space-y-4 cursor-pointer transition-all ${
                        selectedAction === "late" 
                          ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2" 
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedAction("late")}
                    >
                      <h3 className="text-lg font-semibold">My branch is late</h3>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div 
                      className={`p-6 border rounded-lg space-y-4 cursor-pointer transition-all ${
                        selectedAction === "ready" 
                          ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2" 
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedAction("ready")}
                    >
                      <h3 className="text-lg font-semibold">My branch is tested and ready</h3>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div 
                      className={`p-6 border rounded-lg space-y-4 cursor-pointer transition-all ${
                        selectedAction === "mistake" 
                          ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2" 
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedAction("mistake")}
                    >
                      <h3 className="text-lg font-semibold">I've pushed a mistake on my branch that i need to remove from the Git history</h3>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div 
                      className={`p-6 border rounded-lg space-y-4 cursor-pointer transition-all ${
                        selectedAction === "rollback" 
                          ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2" 
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedAction("rollback")}
                    >
                      <h3 className="text-lg font-semibold">I need to push a rollback so the change is explicitly represented in the Git history.</h3>
                    </div>
                  </CarouselItem>
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
              {selectedAction === "late" && (
                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="same-files-changed"
                    checked={sameFilesChanged}
                    onChange={(e) => setSameFilesChanged(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                  />
                  <Label 
                    htmlFor="same-files-changed" 
                    className="text-sm cursor-pointer"
                  >
                    I changed the same files that were also changed in the stable branch.
                  </Label>
                </div>
              )}
            </div>
            <DrawerFooter>
              {selectedAction && (
                <Button 
                  onClick={handleProceed}
                  disabled={isProceeding}
                  className={`w-full mb-2 transition-all ${
                    isProceeding ? "bg-green-600 hover:bg-green-700" : ""
                  }`}
                >
                  {isProceeding ? (
                    <span className="flex items-center gap-2">
                      <Check className="h-5 w-5 animate-in zoom-in duration-300" />
                      Confirmed!
                    </span>
                  ) : (
                    "Proceed"
                  )}
                </Button>
              )}
              <DrawerClose asChild>
                <Button variant="outline" className="w-full">Close</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
      
      {/* Message Dialog */}
      <MessageDialog
        open={messageDialogOpen}
        onOpenChange={setMessageDialogOpen}
        messages={messageDialogContent}
        lastButtonLabel="Show me!"
        onLastButtonClick={() => {
          if (shouldShowDiff) {
            // Show diff dialog for interactive rebase (checkbox checked)
            setMessageDialogOpen(false);
            setDiffDialogOpen(true);
          } else if (showResetEffect) {
            // Show reset effect (remove 876369a, add main badge to ba78722)
            setMessageDialogOpen(false);
            // showResetEffect is already set, increment remount key to force re-render
            setTreeRemountKey(prev => prev + 1);
          } else {
            // Directly show fake merge commit for regular rebase (checkbox unchecked)
            setMessageDialogOpen(false);
            setShowFakeMergeCommit(true);
          }
        }}
        onComplete={() => {
          setShouldShowDiff(false);
        }}
      />
      
      {/* Diff Dialog */}
      <DiffDialog
        open={diffDialogOpen}
        onOpenChange={setDiffDialogOpen}
        onMerge={() => {
          setShowFakeMergeCommit(true);
        }}
      />
    </div>
  );
}

