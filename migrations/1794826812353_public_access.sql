-- Reading without an account. Both switches are off unless someone turns them on:
-- an instance admin allows it for the instance, then a workspace's admins choose
-- to show that workspace. Only its projects with access = 'public' can be read.
INSERT INTO instance_setting (key, value) VALUES ('publicAccess', 'false');

ALTER TABLE workspace ADD COLUMN public INTEGER NOT NULL DEFAULT 0;
