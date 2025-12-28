import express from 'express';
import cors from 'cors';
import {
  getCommits,
  getCommitsFromBranch,
  getBranches,
  getTags,
  type GetCommitsOptions,
} from './lib/git-log.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Git API server is running' });
});

// Get commits endpoint
app.get('/api/commits', (req, res) => {
  try {
    const options: GetCommitsOptions = {
      maxCount: req.query.maxCount ? parseInt(req.query.maxCount as string) : undefined,
      since: req.query.since as string | undefined,
      until: req.query.until as string | undefined,
      author: req.query.author as string | undefined,
      path: req.query.path as string | undefined,
      all: req.query.all === 'true',
    };

    const commits = getCommits(options);
    res.json(commits);
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({
      error: 'Failed to fetch commits',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get commits from a specific branch endpoint
app.get('/api/commits/branch/:branchName', (req, res) => {
  try {
    const { branchName } = req.params;
    const options: Omit<GetCommitsOptions, 'all'> = {
      maxCount: req.query.maxCount ? parseInt(req.query.maxCount as string) : undefined,
      since: req.query.since as string | undefined,
      until: req.query.until as string | undefined,
      author: req.query.author as string | undefined,
      path: req.query.path as string | undefined,
    };

    const commits = getCommitsFromBranch(branchName, options);
    res.json(commits);
  } catch (error) {
    console.error(`Error fetching commits for branch ${req.params.branchName}:`, error);
    res.status(500).json({
      error: 'Failed to fetch commits',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get branches endpoint
app.get('/api/branches', (req, res) => {
  try {
    const options = {
      remote: req.query.remote === 'true',
      all: req.query.all === 'true',
    };

    const branches = getBranches(options);
    res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({
      error: 'Failed to fetch branches',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get tags endpoint
app.get('/api/tags', (req, res) => {
  try {
    const options = {
      sort: req.query.sort === 'true',
    };

    const tags = getTags(options);
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({
      error: 'Failed to fetch tags',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Git API server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   GET /api/health`);
  console.log(`   GET /api/commits`);
  console.log(`   GET /api/commits/branch/:branchName`);
  console.log(`   GET /api/branches`);
  console.log(`   GET /api/tags`);
});

