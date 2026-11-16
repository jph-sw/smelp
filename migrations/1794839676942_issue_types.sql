UPDATE issue SET type = lower(trim(type));
UPDATE issue SET type = 'task' WHERE type NOT IN ('task', 'bug', 'story', 'epic');
