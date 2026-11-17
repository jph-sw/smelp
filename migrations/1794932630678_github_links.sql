-- The GitHub repository a project listens to, one per project. Its id is the
-- webhook address. The secret checks each delivery's signature, which needs the
-- secret itself (a hash can't), so it is kept as is and only shown on connect.
CREATE TABLE project_github_repo (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL UNIQUE REFERENCES project(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    secret TEXT NOT NULL,
    createdBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    createdAt INTEGER NOT NULL
) STRICT;

-- Branches, commits and pull requests that mention a work item's key. ref is the
-- branch name, the commit sha or the pull request number. Only a pull request
-- has a state.
CREATE TABLE issue_github_ref (
    id TEXT NOT NULL PRIMARY KEY,
    issueId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('branch', 'commit', 'pull_request')),
    ref TEXT NOT NULL,
    title TEXT,
    url TEXT NOT NULL,
    state TEXT CHECK (
        CASE kind
            WHEN 'pull_request' THEN state IS NOT NULL AND state IN ('open', 'merged', 'closed')
            ELSE state IS NULL
        END
    ),
    author TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE (issueId, repo, kind, ref)
) STRICT;
