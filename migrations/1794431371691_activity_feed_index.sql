-- The workspace activity feed reads newest first, a page at a time.
CREATE INDEX activity_logs_feed ON activity_logs (workspaceId, createdAt, id);
