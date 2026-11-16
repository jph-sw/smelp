-- Sign-up becomes one setting with three modes: closed, open, or open to guests.
INSERT INTO instance_setting (key, value)
SELECT 'signup', CASE WHEN value = 'true' THEN 'open' ELSE 'closed' END
FROM instance_setting WHERE key = 'signupOpen';

DELETE FROM instance_setting WHERE key = 'signupOpen';
