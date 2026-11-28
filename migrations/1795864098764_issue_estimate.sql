-- Story points, any non-negative number so imported Jira values like 0.5 or 21 survive, or NULL for unestimated.
ALTER TABLE issue ADD COLUMN estimate REAL;
