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

    // Handle remote branches: strip "origin/" prefix to get local branch name
    // This allows remote branch refs to be treated as local branch refs
    let localBranchName = branchName;
    if (branchName.startsWith('origin/')) {
      localBranchName = branchName.substring(7); // Remove "origin/" prefix
    }

    // Only add if it's a local branch (no remaining slashes) and not HEAD
    // When hideRemoteBranches is true, use local branch name (strip origin/ prefix)
    // When hideRemoteBranches is false, still prefer local name but can show remote
    if (!localBranchName.includes('/') && localBranchName !== 'HEAD') {
      if (hideRemoteBranches) {
        // Use local branch name, avoid duplicates
        if (!branches.includes(localBranchName)) {
          branches.push(localBranchName);
        }
      } else {
        // Can show both local and remote, but prefer local
        if (!branches.includes(localBranchName) && !branches.includes(branchName)) {
          branches.push(localBranchName);
        }
      }
    }
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
  const [isMergeFromReady, setIsMergeFromReady] = React.useState(false);
  
  // Fake rollback commit state
  const [showFakeRollbackCommit, setShowFakeRollbackCommit] = React.useState(false);
  const [shouldMoveFeatureBranchCommits, setShouldMoveFeatureBranchCommits] = React.useState(false);
  const [lastActionType, setLastActionType] = React.useState<"late" | "ready" | "mistake" | "rollback" | null>(null);
  
  // Reset effect state (remove all main branch commits above ba78722 and add main badge to ba78722)
  const [showResetEffect, setShowResetEffect] = React.useState(false);
  const [treeRemountKey, setTreeRemountKey] = React.useState(0);
  
  // Remove feature branch commits state (remove 09af298 and 3ad0351 for "ready" action)
  const [removeFeatureBranchCommits, setRemoveFeatureBranchCommits] = React.useState(false);
  
  // Action states
  const [sameFilesChanged, setSameFilesChanged] = React.useState(false);
  
  // Handle proceed action
  const handleProceed = React.useCallback(() => {
    setIsProceeding(true);
    
    // Capture the selected action and checkbox state before resetting
    const action = selectedAction;
    const hasSameFilesChanged = sameFilesChanged;
    
    // Reset merge flags (will be set appropriately based on action)
    setIsMergeFromReady(false);
    setShouldMoveFeatureBranchCommits(false);
    
    // Close drawer first with confirmation animation
    setTimeout(() => {
      setIsProceeding(false);
      setSelectedAction(null);
      setSameFilesChanged(false);
      setDrawerOpen(false);
      
      // Show message dialog after drawer closes based on selected action
      if (action === "late") {
        // For "late" action, always move feature-branch commits to top
        // But only show fake merge commit when checkbox is ticked (after diff dialog merge)
        setLastActionType("late");
        setShouldMoveFeatureBranchCommits(true);
        setIsMergeFromReady(false); // Will be set to true only when merging from diff dialog
        
        // Small delay to ensure drawer is fully closed
        setTimeout(() => {
          const messages: React.ReactNode[] = hasSameFilesChanged
            ? [
                "It is recommended to interactively rebase your work on top of the stable branch.",
                <div key="interactive-steps">
                  <p className="mb-3">This is done in 4 steps :</p>
                  <div className="space-y-2">
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git checkout feature-branch</code></pre>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git rebase -i main</code></pre>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><strong>Test your changes</strong></pre>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git commit -m "Merging feature-branch changes to main"</code></pre>
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto"><code>git push origin main --force</code></pre>
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
        // Set flag to indicate this is a merge from "ready" action
        // For "ready" action, don't move feature-branch commits, just add fake merge commit
        // Also remove feature-branch commits (09af298 and 3ad0351) from the list
        setLastActionType("ready");
        console.log('Setting isMergeFromReady to true for ready action');
        setIsMergeFromReady(true);
        setShouldMoveFeatureBranchCommits(false);
        setRemoveFeatureBranchCommits(true); // Remove commits immediately
        setTreeRemountKey(prev => prev + 1); // Force tree remount
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
        setLastActionType("mistake");
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
        setLastActionType("rollback");
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
      // Don't reset isMergeFromReady, shouldMoveFeatureBranchCommits, or lastActionType here
      // They are needed when "Show me!" is clicked after the drawer closes
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
    const timeoutId4 = setTimeout(measureDimensions, 200); // Extra delay when commits are removed
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      clearTimeout(timeoutId4);
    };
  }, [paginatedCommits.length, currentPage, showResetEffect, showFakeMergeCommit, showFakeRollbackCommit, removeFeatureBranchCommits]); // Re-measure when commits are filtered

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
              
              // Build commitsToRender first to know what's actually rendered
              // This matches what will be rendered in the table below
              const commitsToRenderForMapping = [...paginatedCommits];
              if (showResetEffect) {
                // Find ba78722 commit
                const ba78722Index = commitsToRenderForMapping.findIndex(c => c.abbreviated_commit === "ba78722");
                
                const indicesToRemove: number[] = [];
                
                if (ba78722Index !== -1) {
                  // Remove all commits from main branch above ba78722 (commits that come before it in the list)
                  for (let idx = 0; idx < ba78722Index; idx++) {
                    const commit = commitsToRenderForMapping[idx];
                    const branchRefs = parseBranchRefs(commit.refs, hideRemoteBranches);
                    // Check if commit is on main branch
                    if (branchRefs.includes("main") || branchRefs.includes("master")) {
                      indicesToRemove.push(idx);
                      console.log(`GitWindow: Marking main branch commit ${commit.abbreviated_commit} for removal at index ${idx}`);
                    }
                  }
                }
                
                // Also remove specific commits 876369a and 48975f5 regardless of their branch
                commitsToRenderForMapping.forEach((c, idx) => {
                  if (c.abbreviated_commit === "876369a" || c.abbreviated_commit === "48975f5") {
                    if (!indicesToRemove.includes(idx)) {
                      indicesToRemove.push(idx);
                      console.log(`GitWindow: Marking commit ${c.abbreviated_commit} for removal at index ${idx}`);
                    }
                  }
                });
                
                // Remove from highest index to lowest to avoid index shifting issues
                indicesToRemove.sort((a, b) => b - a).forEach(idx => {
                  const removed = commitsToRenderForMapping.splice(idx, 1);
                  console.log(`GitWindow: Removed commit ${removed[0]?.abbreviated_commit} from commitsToRenderForMapping`);
                });
                console.log(`GitWindow: After removal, commitsToRenderForMapping has ${commitsToRenderForMapping.length} commits`);
              }
              
              // Remove feature-branch commits (09af298 and 3ad0351) when ready action is processed
              if (removeFeatureBranchCommits) {
                const indicesToRemove: number[] = [];
                commitsToRenderForMapping.forEach((c, idx) => {
                  if (c.abbreviated_commit === "09af298" || c.abbreviated_commit === "3ad0351") {
                    indicesToRemove.push(idx);
                    console.log(`GitWindow: Marking commit ${c.abbreviated_commit} for removal at index ${idx}`);
                  }
                });
                indicesToRemove.sort((a, b) => b - a).forEach(idx => {
                  const removed = commitsToRenderForMapping.splice(idx, 1);
                  console.log(`GitWindow: Removed commit ${removed[0]?.abbreviated_commit} from commitsToRenderForMapping`);
                });
                console.log(`GitWindow: After removal, commitsToRenderForMapping has ${commitsToRenderForMapping.length} commits`);
              }
              
              // Start with commitsToRenderForMapping - create new array to ensure reference changes
              let commitsForTree = commitsToRenderForMapping
                .map(c => ({
                  commit: c.commit,
                  parent: c.parent,
                  refs: c.refs,
                }));
              
              // Debug: log commits before filtering
              console.log('commitsForTree before filtering:', commitsForTree.length, commitsForTree.map(c => c.commit.substring(0, 7)));
              
              // When fake merge is shown, conditionally move feature-branch commits (09af298 and 3ad0351) to the top
              // Only move them when merging from DiffDialog (late action with checkbox), not for "ready" action
              // Skip this if commits are being removed
              if (showFakeMergeCommit && shouldMoveFeatureBranchCommits && !removeFeatureBranchCommits) {
                // Find and extract feature-branch commits
                const featureBranchCommits: Array<{ commit: string; parent: string; refs: string }> = [];
                commitsForTree = commitsForTree.filter(c => {
                  const isFeatureBranchCommit = c.commit.includes('09af298') || c.commit.includes('3ad0351');
                  if (isFeatureBranchCommit) {
                    featureBranchCommits.push(c);
                    console.log('Extracting feature-branch commit to move to top:', c.commit.substring(0, 7));
                  }
                  return !isFeatureBranchCommit;
                });
                
                // Change feature-branch commits to main (blue) instead of feature-branch (red)
                // Only the top commit should have the main badge
                const updatedFeatureBranchCommits = featureBranchCommits.map((c, idx) => {
                  const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                  const refsList = c.refs ? c.refs.split(',').map(r => r.trim()).filter(r => r) : [];
                  
                  // Remove feature-branch ref
                  const updatedRefsList = refsList.filter(r => !r.includes('feature-branch') && !r.includes('HEAD -> feature-branch'));
                  
                  // Only add main ref to the first commit (09af298) - it will be at index 0 after reverse
                  // After reverse, the array will be [09af298, 3ad0351], so idx 0 is 09af298
                  const is09af298 = c.commit.includes('09af298');
                  if (is09af298) {
                    // Add main ref only to 09af298 (top commit)
                    if (!updatedRefsList.some(r => r.includes('main') || r.includes('HEAD -> main'))) {
                      updatedRefsList.push("HEAD -> main");
                    }
                  } else {
                    // Remove main ref from 3ad0351 (not the top commit)
                    const filteredRefsList = updatedRefsList.filter(r => !r.includes('main') && !r.includes('HEAD -> main'));
                    updatedRefsList.length = 0;
                    updatedRefsList.push(...filteredRefsList);
                  }
                  
                  return {
                    ...c,
                    refs: updatedRefsList.join(', ') || "",
                  };
                });
                
                // Insert feature-branch commits at the top, maintaining order (09af298 first, then 3ad0351)
                // Reverse to maintain chronological order (newest first)
                updatedFeatureBranchCommits.reverse().forEach(commit => {
                  commitsForTree.unshift(commit);
                });
              }
              
              // If this is from merge action (ready or late with checkbox), add fake merge commit at the very top
              if (showFakeMergeCommit && isMergeFromReady) {
                console.log('Adding fake merge commit to commitsForTree');
                // Find the latest main branch commit for the fake merge parent
                // Look in original paginatedCommits to find the true latest main commit
                const latestMainCommit = paginatedCommits.find(c => {
                  const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                  return branchRefs.includes("main");
                }) || paginatedCommits.find(c => c.abbreviated_commit === "ba78722");
                
                // Create fake merge commit for tree
                const fakeMergeCommitForTree = {
                  commit: "merge-commit-abc123",
                  parent: latestMainCommit ? latestMainCommit.commit : "",
                  refs: "HEAD -> main",
                };
                
                // Insert fake merge commit at the very top (index 0)
                commitsForTree.unshift(fakeMergeCommitForTree);
              }
              
              // If this is from rollback action, add fake rollback commit at the very top
              if (showFakeRollbackCommit) {
                console.log('Adding fake rollback commit to commitsForTree');
                // Find the latest main branch commit for the fake rollback parent
                const latestMainCommit = paginatedCommits.find(c => {
                  const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                  return branchRefs.includes("main") || branchRefs.includes("master");
                }) || paginatedCommits.find(c => c.abbreviated_commit === "ba78722");
                
                // Create fake rollback commit for tree
                const fakeRollbackCommitForTree = {
                  commit: "rollback-commit-xyz789",
                  parent: latestMainCommit ? latestMainCommit.commit : "",
                  refs: "HEAD -> main",
                };
                
                // Insert fake rollback commit at the very top (index 0)
                commitsForTree.unshift(fakeRollbackCommitForTree);
              }
              
              // Remove "main" badge from all other commits (but keep it on fake merge, fake rollback, or moved feature-branch commits)
              // Only modify refs when feature-branch commits are moved (shouldMoveFeatureBranchCommits is true)
              if (showFakeMergeCommit || showFakeRollbackCommit) {
                commitsForTree = commitsForTree.map((c, index) => {
                  const isFakeMerge = c.commit === "merge-commit-abc123";
                  const isFakeRollback = c.commit === "rollback-commit-xyz789";
                  const is09af298 = c.commit.includes('09af298');
                  const is3ad0351 = c.commit.includes('3ad0351');
                  const isFeatureBranchCommit = is09af298 || is3ad0351;
                  
                  // Keep main badge on fake merge commit (index 0)
                  if (isFakeMerge && index === 0) {
                    // Keep main badge on fake merge commit
                    return c;
                  }
                  
                  // Keep main badge on fake rollback commit (index 0, or index 1 if fake merge exists)
                  if (isFakeRollback && (index === 0 || (showFakeMergeCommit && index === 1))) {
                    // Keep main badge on fake rollback commit
                    return c;
                  }
                  
                  // If feature-branch commits are not moved, keep their original refs
                  if (isFeatureBranchCommit && !shouldMoveFeatureBranchCommits) {
                    return c;
                  }
                  
                  // Only modify feature-branch commits when they are moved
                  if (isFeatureBranchCommit && shouldMoveFeatureBranchCommits) {
                    const effectiveIndex = isMergeFromReady ? index - 1 : index;
                    if (is09af298 && effectiveIndex === 0) {
                      // Keep main badge on 09af298 at effective index 0
                      return c;
                    }
                    
                    if (is3ad0351) {
                      // Remove main badge from 3ad0351 (it's not the top commit)
                      const refsList = c.refs ? c.refs.split(',').map(r => r.trim()).filter(r => r) : [];
                      const updatedRefsList = refsList.filter(r => !r.includes('main') && !r.includes('HEAD -> main'));
                      return {
                        ...c,
                        refs: updatedRefsList.join(', ') || "",
                      };
                    }
                  }
                  
                  // Remove main badge from all other commits (except fake merge, fake rollback, and moved feature-branch commits)
                  if (!isFakeMerge && !isFakeRollback && !(isFeatureBranchCommit && shouldMoveFeatureBranchCommits)) {
                    const refsList = c.refs ? c.refs.split(',').map(r => r.trim()).filter(r => r) : [];
                    const updatedRefsList = refsList.filter(r => !r.includes('main') && !r.includes('HEAD -> main'));
                    return {
                      ...c,
                      refs: updatedRefsList.join(', ') || "",
                    };
                  }
                  
                  return c;
                });
              }
              
              // Debug: log commits after filtering
              console.log('commitsForTree after filtering:', commitsForTree.length, commitsForTree.map(c => c.commit.substring(0, 7)));
              console.log('3ad0351 in commitsForTree?', commitsForTree.some(c => c.commit.includes('3ad0351')));
              
              // Update parent references and refs when reset effect is shown (commits already removed from commitsForTree)
              if (showResetEffect) {
                // Find ba78722 commit
                const ba78722Index = paginatedCommits.findIndex(pc => pc.abbreviated_commit === "ba78722");
                
                // Find all commits to remove: main branch commits above ba78722 + specific commits 876369a and 48975f5
                const commitsToRemove: GitCommit[] = [];
                
                if (ba78722Index !== -1) {
                  // Find all commits from main branch above ba78722
                  const mainBranchCommits = paginatedCommits
                    .slice(0, ba78722Index)
                    .filter(pc => {
                      const branchRefs = parseBranchRefs(pc.refs, hideRemoteBranches);
                      return branchRefs.includes("main") || branchRefs.includes("master");
                    });
                  commitsToRemove.push(...mainBranchCommits);
                }
                
                // Also include specific commits 876369a and 48975f5
                const specificCommits = paginatedCommits.filter(pc => 
                  pc.abbreviated_commit === "876369a" || pc.abbreviated_commit === "48975f5"
                );
                specificCommits.forEach(sc => {
                  if (!commitsToRemove.find(c => c.commit === sc.commit)) {
                    commitsToRemove.push(sc);
                  }
                });
                  
                  if (commitsToRemove.length > 0) {
                    const removedCommitHashes = new Set(commitsToRemove.map(c => c.commit));
                    
                    // Build a map of removed commit -> its parent for parent reference updates
                    const removedCommitToParent = new Map<string, string>();
                    commitsToRemove.forEach(commitToRemove => {
                      const removedCommitHash = commitToRemove.commit;
                      const removedCommitParent = commitToRemove.parent.split(' ').filter(p => p.trim())[0]; // First parent
                      if (removedCommitParent) {
                        removedCommitToParent.set(removedCommitHash, removedCommitParent);
                      }
                    });
                    
                    // Find ba78722 commit hash for ref update
                    const ba78722Commit = commitsToRenderForMapping.find(c2 => c2.abbreviated_commit === 'ba78722');
                    const ba78722CommitHash = ba78722Commit?.commit;
                    
                    // Update parent references and refs: if any commit has a removed commit as a parent, 
                    // update it to point to the removed commit's parent
                    // Also add "main" ref to ba78722
                    commitsForTree = commitsForTree.map((c, index) => {
                      const parents = c.parent.split(' ').filter(p => p.trim());
                      let updatedParents = [...parents];
                      let hasChanges = false;
                      let updatedRefs = c.refs;
                      
                      // Update parent references
                      parents.forEach(parentHash => {
                        if (removedCommitHashes.has(parentHash)) {
                          // This parent was removed, replace it with the removed commit's parent
                          const replacementParent = removedCommitToParent.get(parentHash);
                          if (replacementParent) {
                            const index = updatedParents.indexOf(parentHash);
                            if (index !== -1) {
                              updatedParents[index] = replacementParent;
                              hasChanges = true;
                            }
                          } else {
                            // No replacement parent, remove this parent reference
                            updatedParents = updatedParents.filter(p => p !== parentHash);
                            hasChanges = true;
                          }
                        }
                      });
                      
                      // Update refs: add "main" to ba78722 (but not when fake merge is shown)
                      if (showResetEffect && !showFakeMergeCommit) {
                        const isBa78722 = ba78722CommitHash && c.commit === ba78722CommitHash;
                        if (isBa78722) {
                          const currentBranchRefs = parseBranchRefs(updatedRefs, hideRemoteBranches);
                          if (!currentBranchRefs.includes("main")) {
                            // Add "main" ref to ba78722
                            const refsList = updatedRefs ? updatedRefs.split(',').map(r => r.trim()).filter(r => r) : [];
                            if (!refsList.some(r => r.includes('main') || r.includes('HEAD -> main'))) {
                              refsList.push('HEAD -> main');
                              updatedRefs = refsList.join(', ');
                              hasChanges = true;
                              console.log(`GitWindow: Added main ref to ba78722: ${updatedRefs}`);
                            }
                          }
                        }
                      }
                      
                      if (hasChanges) {
                        return {
                          ...c,
                          parent: updatedParents.filter(p => p).join(' '),
                          refs: updatedRefs,
                        };
                      }
                      return c;
                    });
                  }
              }
              
              // Update parent references when feature-branch commits are removed
              if (removeFeatureBranchCommits) {
                const commitsToRemove = paginatedCommits.filter(pc => 
                  pc.abbreviated_commit === "09af298" || pc.abbreviated_commit === "3ad0351"
                );
                
                if (commitsToRemove.length > 0) {
                  const removedCommitHashes = new Set(commitsToRemove.map(c => c.commit));
                  
                  // Build a map of removed commit -> its parent for parent reference updates
                  const removedCommitToParent = new Map<string, string>();
                  commitsToRemove.forEach(commitToRemove => {
                    const removedCommitHash = commitToRemove.commit;
                    const removedCommitParent = commitToRemove.parent.split(' ').filter(p => p.trim())[0]; // First parent
                    if (removedCommitParent) {
                      removedCommitToParent.set(removedCommitHash, removedCommitParent);
                    }
                  });
                  
                  // Update parent references: if any commit has a removed commit as a parent, 
                  // update it to point to the removed commit's parent
                  commitsForTree = commitsForTree.map((c) => {
                    const parents = c.parent.split(' ').filter(p => p.trim());
                    let updatedParents = [...parents];
                    let hasChanges = false;
                    
                    // Update parent references
                    parents.forEach(parentHash => {
                      if (removedCommitHashes.has(parentHash)) {
                        // This parent was removed, replace it with the removed commit's parent
                        const replacementParent = removedCommitToParent.get(parentHash);
                        if (replacementParent) {
                          const index = updatedParents.indexOf(parentHash);
                          if (index !== -1) {
                            updatedParents[index] = replacementParent;
                            hasChanges = true;
                          }
                        } else {
                          // No replacement parent, remove this parent reference
                          updatedParents = updatedParents.filter(p => p !== parentHash);
                          hasChanges = true;
                        }
                      }
                    });
                    
                    if (hasChanges) {
                      return {
                        ...c,
                        parent: updatedParents.filter(p => p).join(' '),
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
              
              // Calculate treeRowPositions to match commitsForTree
              // Build the actual commitsToRender that matches what's rendered in the table
              const actualCommitsToRender = (() => {
                const commits = [...paginatedCommits];
                
                // Remove all commits from main branch above ba78722 when reset effect is shown
                // Also remove specific commits 876369a and 48975f5
                if (showResetEffect) {
                  const ba78722Index = commits.findIndex(c => c.abbreviated_commit === "ba78722");
                  
                  const indicesToRemove: number[] = [];
                  
                  if (ba78722Index !== -1) {
                    // Remove all commits from main branch above ba78722 (commits that come before it in the list)
                    for (let idx = 0; idx < ba78722Index; idx++) {
                      const commit = commits[idx];
                      const branchRefs = parseBranchRefs(commit.refs, hideRemoteBranches);
                      // Check if commit is on main branch
                      if (branchRefs.includes("main") || branchRefs.includes("master")) {
                        indicesToRemove.push(idx);
                      }
                    }
                  }
                  
                  // Also remove specific commits 876369a and 48975f5 regardless of their branch
                  commits.forEach((c, idx) => {
                    if (c.abbreviated_commit === "876369a" || c.abbreviated_commit === "48975f5") {
                      if (!indicesToRemove.includes(idx)) {
                        indicesToRemove.push(idx);
                      }
                    }
                  });
                  
                  // Remove from highest index to lowest to avoid index shifting issues
                  indicesToRemove.sort((a, b) => b - a).forEach(idx => {
                    commits.splice(idx, 1);
                  });
                }
                
                // Remove feature-branch commits (09af298 and 3ad0351) when ready action is processed
                if (removeFeatureBranchCommits) {
                  const indicesToRemove: number[] = [];
                  commits.forEach((c, idx) => {
                    if (c.abbreviated_commit === "09af298" || c.abbreviated_commit === "3ad0351") {
                      indicesToRemove.push(idx);
                    }
                  });
                  indicesToRemove.sort((a, b) => b - a).forEach(idx => {
                    commits.splice(idx, 1);
                  });
                }
                
                // When fake merge is shown, conditionally move feature-branch commits (09af298 and 3ad0351) to the top
                // Skip this if commits are being removed
                // When fake merge is shown, conditionally move feature-branch commits (09af298 and 3ad0351) to the top
                // Only move them when merging from DiffDialog (late action with checkbox), not for "ready" action
                // Skip this if commits are being removed
                if (showFakeMergeCommit && shouldMoveFeatureBranchCommits && !removeFeatureBranchCommits) {
                  // Find and extract feature-branch commits
                  const featureBranchCommits: GitCommit[] = [];
                  const featureBranchIndicesToRemove: number[] = [];
                  
                  commits.forEach((c, idx) => {
                    if (c.abbreviated_commit === "09af298" || c.abbreviated_commit === "3ad0351") {
                      featureBranchCommits.push(c);
                      featureBranchIndicesToRemove.push(idx);
                    }
                  });
                  
                  // Remove from original positions (from highest index to lowest)
                  featureBranchIndicesToRemove.sort((a, b) => b - a).forEach(idx => {
                    commits.splice(idx, 1);
                  });
                  
                  // Insert feature-branch commits at the top, maintaining order (09af298 first, then 3ad0351)
                  // Reverse to maintain chronological order (newest first)
                  featureBranchCommits.reverse().forEach(commit => {
                    commits.unshift(commit);
                  });
                }
                
                // If this is from merge action (ready or late with checkbox), add fake merge commit at the very top
                if (showFakeMergeCommit && isMergeFromReady) {
                  console.log('Adding fake merge commit to actualCommitsToRender');
                  // Find the latest main branch commit for the fake merge parent
                  // Look in original paginatedCommits to find the true latest main commit
                  const latestMainCommit = paginatedCommits.find(c => {
                    const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                    return branchRefs.includes("main");
                  }) || paginatedCommits.find(c => c.abbreviated_commit === "ba78722");
                  
                  // Create fake merge commit
                  const fakeMergeCommit: GitCommit = {
                    commit: "merge-commit-abc123",
                    abbreviated_commit: "abc123",
                    tree: "",
                    abbreviated_tree: "",
                    parent: latestMainCommit ? latestMainCommit.commit : "",
                    abbreviated_parent: latestMainCommit ? latestMainCommit.abbreviated_commit : "",
                    refs: "HEAD -> main",
                    encoding: "",
                    subject: "Merging feature-branch changes to main",
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
                  
                  // Insert fake merge commit at the very top (index 0)
                  commits.unshift(fakeMergeCommit);
                }
                
                // If this is from rollback action, add fake rollback commit at the very top
                if (showFakeRollbackCommit) {
                  console.log('Adding fake rollback commit to actualCommitsToRender');
                  // Find the latest main branch commit for the fake rollback parent
                  const latestMainCommit = paginatedCommits.find(c => {
                    const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                    return branchRefs.includes("main") || branchRefs.includes("master");
                  }) || paginatedCommits.find(c => c.abbreviated_commit === "ba78722");
                  
                  // Create fake rollback commit
                  const fakeRollbackCommit: GitCommit = {
                    commit: "rollback-commit-xyz789",
                    abbreviated_commit: "xyz789",
                    tree: "",
                    abbreviated_tree: "",
                    parent: latestMainCommit ? latestMainCommit.commit : "",
                    abbreviated_parent: latestMainCommit ? latestMainCommit.abbreviated_commit : "",
                    refs: "HEAD -> main",
                    encoding: "",
                    subject: "Rollback to version x.y.z",
                    sanitized_subject_line: "",
                    body: "",
                    commit_notes: "",
                    verification_flag: "",
                    signer: "",
                    signer_key: "",
                    author: {
                      name: "Rollback Bot",
                      email: "rollback@example.com",
                      date: new Date().toISOString(),
                    },
                    commiter: {
                      name: "Rollback Bot",
                      email: "rollback@example.com",
                      date: new Date().toISOString(),
                    },
                  };
                  
                  // Insert fake rollback commit at the very top (index 0)
                  commits.unshift(fakeRollbackCommit);
                }
                
                return commits;
              })();
              
              let treeRowPositions: number[] = [];
              
              if (showFakeMergeCommit || showFakeRollbackCommit || showResetEffect) {
                // Map commitsForTree to their row positions based on actualCommitsToRender order
                // Build a map of commit hash to its index in actualCommitsToRender
                const commitToIndex = new Map<string, number>();
                actualCommitsToRender.forEach((c, idx) => {
                  commitToIndex.set(c.commit, idx);
                });
                
                // Map commitsForTree to their row positions
                commitsForTree.forEach(commit => {
                  const idx = commitToIndex.get(commit.commit);
                  if (idx !== undefined && idx < rowPositions.length) {
                    treeRowPositions.push(rowPositions[idx]);
                  }
                });
              } else {
                // No filtering, use rowPositions directly (should match commitsForTree)
                treeRowPositions = rowPositions.slice(0, commitsForTree.length);
              }
              
              // Ensure treeRowPositions length matches commitsForTree length
              if (treeRowPositions.length !== commitsForTree.length) {
                // If we couldn't find all positions, use fallback calculation
                console.warn(`Mismatch: treeRowPositions.length=${treeRowPositions.length}, commitsForTree.length=${commitsForTree.length}`);
                // Recalculate using measuredHeaderHeight and estimated row heights
                treeRowPositions = commitsForTree.map((_, idx) => {
                  return measuredHeaderHeight + idx * 40 + 20; // Fallback: assume 40px per row
                });
              }
              
              // Create a key that changes when commits are filtered to force re-render
              // Include parent hashes to detect parent reference changes
              // Use remount key to force complete remount when reset effect is triggered
              const treeKey = `tree-${commitsForTree.length}-${showResetEffect}-${showFakeMergeCommit}-${showFakeRollbackCommit}-${removeFeatureBranchCommits}-${treeRemountKey}-${commitsForTree.map(c => `${c.commit.substring(0,7)}:${c.parent.substring(0,7)}`).join('|')}`;
              
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
                    
                    // Remove all commits from main branch above ba78722 when reset effect is shown
                    // Also remove specific commits 876369a and 48975f5
                    if (showResetEffect) {
                      const ba78722Index = commitsToRender.findIndex(c => c.abbreviated_commit === "ba78722");
                      
                      const indicesToRemove: number[] = [];
                      
                      if (ba78722Index !== -1) {
                        // Remove all commits from main branch above ba78722 (commits that come before it in the list)
                        for (let idx = 0; idx < ba78722Index; idx++) {
                          const commit = commitsToRender[idx];
                          const branchRefs = parseBranchRefs(commit.refs, hideRemoteBranches);
                          // Check if commit is on main branch
                          if (branchRefs.includes("main") || branchRefs.includes("master")) {
                            indicesToRemove.push(idx);
                          }
                        }
                      }
                      
                      // Also remove specific commits 876369a and 48975f5 regardless of their branch
                      commitsToRender.forEach((c, idx) => {
                        if (c.abbreviated_commit === "876369a" || c.abbreviated_commit === "48975f5") {
                          if (!indicesToRemove.includes(idx)) {
                            indicesToRemove.push(idx);
                          }
                        }
                      });
                      
                      // Remove from highest index to lowest to avoid index shifting issues
                      indicesToRemove.sort((a, b) => b - a).forEach(idx => {
                        commitsToRender.splice(idx, 1);
                      });
                    }
                    
                    // Remove feature-branch commits (09af298 and 3ad0351) when ready action is processed
                    if (removeFeatureBranchCommits) {
                      const indicesToRemove: number[] = [];
                      commitsToRender.forEach((c, idx) => {
                        if (c.abbreviated_commit === "09af298" || c.abbreviated_commit === "3ad0351") {
                          indicesToRemove.push(idx);
                        }
                      });
                      indicesToRemove.sort((a, b) => b - a).forEach(idx => {
                        commitsToRender.splice(idx, 1);
                      });
                    }
                    
                    // When fake merge is shown, conditionally move feature-branch commits (09af298 and 3ad0351) to the top
                    // Only move them when merging from DiffDialog (late action with checkbox), not for "ready" action
                    // Skip this if commits are being removed
                    if (showFakeMergeCommit && shouldMoveFeatureBranchCommits && !removeFeatureBranchCommits) {
                      // Find and extract feature-branch commits
                      const featureBranchCommits: GitCommit[] = [];
                      const featureBranchIndicesToRemove: number[] = [];
                      
                      commitsToRender.forEach((c, idx) => {
                        if (c.abbreviated_commit === "09af298" || c.abbreviated_commit === "3ad0351") {
                          featureBranchCommits.push(c);
                          featureBranchIndicesToRemove.push(idx);
                        }
                      });
                      
                      // Remove from original positions (from highest index to lowest)
                      featureBranchIndicesToRemove.sort((a, b) => b - a).forEach(idx => {
                        commitsToRender.splice(idx, 1);
                      });
                      
                      // Insert feature-branch commits at the top, maintaining order (09af298 first, then 3ad0351)
                      // Reverse to maintain chronological order (newest first)
                      featureBranchCommits.reverse().forEach(commit => {
                        commitsToRender.unshift(commit);
                      });
                    }
                    
                    // If this is from merge action (ready or late with checkbox), add a fake merge commit at the very top
                    if (showFakeMergeCommit && isMergeFromReady) {
                      console.log('Adding fake merge commit to commitsToRender');
                      // Find the latest main branch commit for the fake merge parent
                      // Look in original paginatedCommits to find the true latest main commit
                      const latestMainCommit = paginatedCommits.find(c => {
                        const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                        return branchRefs.includes("main");
                      }) || paginatedCommits.find(c => c.abbreviated_commit === "ba78722");
                      
                      // Create fake merge commit
                      const fakeMergeCommit: GitCommit = {
                        commit: "merge-commit-abc123",
                        abbreviated_commit: "abc123",
                        tree: "",
                        abbreviated_tree: "",
                        parent: latestMainCommit ? latestMainCommit.commit : "",
                        abbreviated_parent: latestMainCommit ? latestMainCommit.abbreviated_commit : "",
                        refs: "HEAD -> main",
                        encoding: "",
                        subject: "Merging feature-branch changes to main",
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
                      
                      // Insert fake merge commit at the very top (index 0)
                      commitsToRender.unshift(fakeMergeCommit);
                    }
                    
                    // If this is from rollback action, add a fake rollback commit at the very top
                    if (showFakeRollbackCommit) {
                      console.log('Adding fake rollback commit to commitsToRender');
                      // Find the latest main branch commit for the fake rollback parent
                      const latestMainCommit = paginatedCommits.find(c => {
                        const branchRefs = parseBranchRefs(c.refs, hideRemoteBranches);
                        return branchRefs.includes("main") || branchRefs.includes("master");
                      }) || paginatedCommits.find(c => c.abbreviated_commit === "ba78722");
                      
                      // Create fake rollback commit
                      const fakeRollbackCommit: GitCommit = {
                        commit: "rollback-commit-xyz789",
                        abbreviated_commit: "xyz789",
                        tree: "",
                        abbreviated_tree: "",
                        parent: latestMainCommit ? latestMainCommit.commit : "",
                        abbreviated_parent: latestMainCommit ? latestMainCommit.abbreviated_commit : "",
                        refs: "HEAD -> main",
                        encoding: "",
                        subject: "Rollback to version x.y.z",
                        sanitized_subject_line: "",
                        body: "",
                        commit_notes: "",
                        verification_flag: "",
                        signer: "",
                        signer_key: "",
                        author: {
                          name: "Rollback Bot",
                          email: "rollback@example.com",
                          date: new Date().toISOString(),
                        },
                        commiter: {
                          name: "Rollback Bot",
                          email: "rollback@example.com",
                          date: new Date().toISOString(),
                        },
                      };
                      
                      // Insert fake rollback commit at the very top (index 0)
                      commitsToRender.unshift(fakeRollbackCommit);
                    }
                    
                    // Build a map of branch -> tip commit
                    // For main branch: always use index 0 (top commit) since commits are artificially placed
                    // For other branches: find the first commit with that branch ref
                    const branchTips = new Map<string, number>();
                    
                    // For main/master branch, always set tip to index 0 (visually top commit)
                    // This ensures the badge moves to the new top when commits are artificially added
                    if (commitsToRender.length > 0) {
                      const firstCommitRefs = parseBranchRefs(commitsToRender[0].refs, hideRemoteBranches);
                      if (firstCommitRefs.includes("main")) {
                        branchTips.set("main", 0);
                      } else if (firstCommitRefs.includes("master")) {
                        branchTips.set("master", 0);
                      } else {
                        // Even if the top commit doesn't have main ref, check if any commit has main ref
                        // and if so, force main tip to index 0 (for artificially added commits)
                        for (const c of commitsToRender) {
                          const refs = parseBranchRefs(c.refs, hideRemoteBranches);
                          if (refs.includes("main")) {
                            branchTips.set("main", 0);
                            break;
                          } else if (refs.includes("master")) {
                            branchTips.set("master", 0);
                            break;
                          }
                        }
                      }
                    }
                    
                    // For other branches (like feature-branch), find the first commit with that branch ref
                    commitsToRender.forEach((c, idx) => {
                      const refs = parseBranchRefs(c.refs, hideRemoteBranches);
                      refs.forEach(branch => {
                        // Skip main/master as we already handled it above
                        if (branch !== "main" && branch !== "master" && !branchTips.has(branch)) {
                          branchTips.set(branch, idx);
                          // Debug: log branch tips
                          if (branch === "feature-branch") {
                            console.log(`GitWindow: Found ${branch} tip at index ${idx}: ${c.abbreviated_commit}`, { refs: c.refs, parsedRefs: refs });
                          }
                        }
                      });
                    });
                    console.log('GitWindow: branchTips map:', Array.from(branchTips.entries()));
                    
                    return commitsToRender.map((commit, index) => {
                      const isBa78722 = commit.abbreviated_commit === "ba78722";
                      const is09af298 = commit.abbreviated_commit === "09af298";
                      const is3ad0351 = commit.abbreviated_commit === "3ad0351";
                      const isFakeMergeCommit = commit.commit === "merge-commit-abc123" || commit.abbreviated_commit === "abc123";
                      const isFakeRollbackCommit = commit.commit === "rollback-commit-xyz789" || commit.abbreviated_commit === "xyz789";
                      const isFeatureBranchCommit = is09af298 || is3ad0351;
                      // Get branch refs from commit
                      let branchRefs = parseBranchRefs(commit.refs, hideRemoteBranches);
                      
                      if (showFakeMergeCommit) {
                        // If this is the fake merge commit, it should have main badge
                        if (isFakeMergeCommit) {
                          // Ensure fake merge commit has main badge
                          if (!branchRefs.includes("main")) {
                            branchRefs = [...branchRefs, "main"];
                          }
                        } else if (isFeatureBranchCommit && shouldMoveFeatureBranchCommits) {
                          // Change feature-branch commits to blue (main) when they are moved to top
                          // This applies to: "late" action (both ticked and unticked checkbox)
                          // Remove feature-branch badge
                          branchRefs = branchRefs.filter(branch => branch !== "feature-branch");
                          // Only add main badge to 09af298 if it's the first non-fake-merge commit (index 1 if fake merge exists, index 0 otherwise)
                          const effectiveIndex = isMergeFromReady ? index - 1 : index;
                          if (effectiveIndex === 0 && is09af298) {
                            if (!branchRefs.includes("main")) {
                              branchRefs = [...branchRefs, "main"];
                            }
                          } else {
                            // Remove main badge from other commits (like 3ad0351)
                            branchRefs = branchRefs.filter(branch => branch !== "main");
                          }
                        } else {
                          // Remove "main" badge from all other commits when fake merge is shown
                          // Keep feature-branch badge if this commit is the tip of feature-branch
                          branchRefs = branchRefs.filter(branch => branch !== "main");
                          // Feature-branch badge will be preserved if this commit is the tip (handled by tip filtering below)
                        }
                      }
                      
                      // Add "main" badge to ba78722 when reset effect is shown (but not when fake merge is shown)
                      if (showResetEffect && !showFakeMergeCommit && isBa78722 && !branchRefs.includes("main")) {
                        branchRefs = [...branchRefs, "main"];
                      }
                      
                      // Ensure fake rollback commit has main badge
                      if (showFakeRollbackCommit && isFakeRollbackCommit && !branchRefs.includes("main")) {
                        branchRefs = [...branchRefs, "main"];
                      }
                      
                      // For main branch: if this commit is at the tip (index 0), ensure it has the main badge
                      // This handles cases where commits are artificially added and don't have main refs
                      if (!showFakeMergeCommit && !showFakeRollbackCommit && !showResetEffect) {
                        const mainTipIndex = branchTips.get("main") ?? branchTips.get("master");
                        if (mainTipIndex !== undefined && mainTipIndex === index) {
                          // This commit is the main tip, ensure it has the main badge
                          // Since commits are artificially placed, always add main badge to the top commit
                          if (!branchRefs.includes("main") && !branchRefs.includes("master")) {
                            branchRefs = [...branchRefs, "main"];
                          }
                        }
                      }
                      
                      // Only show badges on branch tips (top commit of each branch)
                      // Filter to only include branches where this commit is the tip
                      // Exception: always show badges on fake commits (merge, rollback) as they are always at the top
                      if (!isFakeMergeCommit && !isFakeRollbackCommit) {
                        branchRefs = branchRefs.filter(branch => {
                          const tipIndex = branchTips.get(branch);
                          const isTip = tipIndex !== undefined && tipIndex === index;
                          // Debug: log main badge filtering for first few commits and 09af298
                          if ((branch === "main" || branch === "master") && (index < 3 || is09af298)) {
                            console.log(`GitWindow: ${commit.abbreviated_commit} (index ${index}) ${branch} badge check - tipIndex: ${tipIndex}, isTip: ${isTip}, refs: ${commit.refs}, branchRefs before filter:`, branchRefs);
                          }
                          // Debug: log feature-branch badge filtering
                          if (branch === "feature-branch" && is09af298) {
                            console.log(`GitWindow: 09af298 feature-branch badge check - tipIndex: ${tipIndex}, index: ${index}, isTip: ${isTip}, branchRefs before filter:`, parseBranchRefs(commit.refs, hideRemoteBranches));
                          }
                          return isTip;
                        });
                      }
                      
                      return (
                        <TableRow 
                          key={commit.commit} 
                          data-commit-row
                          className={
                            showFakeMergeCommit && (isFakeMergeCommit || (isFeatureBranchCommit && shouldMoveFeatureBranchCommits))
                              ? "bg-blue-50 dark:bg-blue-950/20" 
                              : showResetEffect && isBa78722
                              ? "bg-blue-50 dark:bg-blue-950/20"
                              : showFakeRollbackCommit && isFakeRollbackCommit
                              ? "bg-blue-50 dark:bg-blue-950/20"
                              : ""
                          }
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
              <DrawerDescription>Select your current situation</DrawerDescription>
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
                      <h3 className="text-lg font-semibold">I'm done, but my branch is late</h3>
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
                      <h3 className="text-lg font-semibold">My branch is tested and ready to be merged</h3>
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
                      <h3 className="text-lg font-semibold">I need to remove a commit from the Git history</h3>
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
                      <h3 className="text-lg font-semibold">I need to push a rollback in the Git history</h3>
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
                    I changed the same files that were changed in the new commits of the target branch.
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
            // For "late" action with checkbox unticked: move commits but don't show fake merge
            // For "ready" action: show fake merge commit (isMergeFromReady is true, shouldMoveFeatureBranchCommits is false)
            // Set flags here since they may have been reset when drawer closed
            if (lastActionType === "late") {
              // This is "late" action with checkbox unticked - move commits to top
              setShouldMoveFeatureBranchCommits(true);
              setIsMergeFromReady(false);
            } else if (lastActionType === "ready") {
              // This is "ready" action - show fake merge commit, don't move commits
              setIsMergeFromReady(true);
              setShouldMoveFeatureBranchCommits(false);
            } else if (lastActionType === "rollback") {
              // This is "rollback" action - show fake rollback commit
              setShowFakeRollbackCommit(true);
            }
            if (lastActionType !== "rollback") {
              setMessageDialogOpen(false);
              setShowFakeMergeCommit(true);
            } else {
              setMessageDialogOpen(false);
            }
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
          // When merging from diff dialog (late action with checkbox), show fake merge commit at top
          // Also move feature-branch commits to the top
          setIsMergeFromReady(true);
          setShouldMoveFeatureBranchCommits(true);
          setShowFakeMergeCommit(true);
        }}
      />
    </div>
  );
}


