import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
 */
function parseBranchRefs(refs: string): string[] {
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

    // Handle "HEAD -> branch" format
    if (ref.includes(' -> ')) {
      const branchName = ref.split(' -> ')[1].trim();
      if (branchName && branchName !== 'HEAD') {
        branches.push(branchName);
      }
    } else {
      // Regular branch reference
      branches.push(ref);
    }
  }

  // Remove duplicates and sort
  return [...new Set(branches)].sort();
}

export function GitWindow() {
  const [activeTab, setActiveTab] = React.useState<"commits" | "branches" | "tags">("commits");
  const [commits, setCommits] = React.useState<GitCommit[]>([]);
  const [branches, setBranches] = React.useState<GitBranch[]>([]);
  const [tags, setTags] = React.useState<GitTag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Commit</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading commits..." : "No commits fetched. Click 'Fetch Data' to load commits."}
                    </TableCell>
                  </TableRow>
                ) : (
                  commits.map((commit) => {
                    const branchRefs = parseBranchRefs(commit.refs);
                    return (
                      <TableRow key={commit.commit}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex flex-col gap-1">
                            <span>{commit.abbreviated_commit}</span>
                            {branchRefs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {branchRefs.map((branch) => (
                                  <Badge
                                    key={branch}
                                    variant="outline"
                                    className="text-[0.625rem] px-1.5 py-0"
                                  >
                                    {branch}
                                  </Badge>
                                ))}
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
                        <div className="flex items-center gap-2">
                          {branch.isCurrent && (
                            <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                              current
                            </span>
                          )}
                          <span className="font-medium">{branch.name}</span>
                        </div>
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

