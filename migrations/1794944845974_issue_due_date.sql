-- The day a work item should be done by, YYYY-MM-DD like cycle dates, or NULL for none.
ALTER TABLE issue ADD COLUMN dueDate TEXT;
