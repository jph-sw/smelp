CREATE TABLE instance_setting (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

-- Public sign-up is closed unless an instance admin opens it.
INSERT INTO instance_setting (key, value) VALUES ('signupOpen', 'false');

-- Existing installs have no way to get an admin, so the oldest account becomes one.
UPDATE auth_user SET role = 'admin'
WHERE id = (SELECT id FROM auth_user ORDER BY createdAt ASC LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM auth_user WHERE role = 'admin');

-- Invites become links: email is now optional, and acceptance needs a secret token.
-- Older invites have no token, so they come across already expired.
CREATE TABLE auth_space_invite_new (
    id TEXT NOT NULL PRIMARY KEY,
    spaceId TEXT NOT NULL REFERENCES auth_space(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('guest', 'member', 'admin')),
    invitedByUserId TEXT NOT NULL REFERENCES auth_user(id),
    createdAt INTEGER NOT NULL,
    acceptedAt INTEGER,
    tokenHash TEXT,
    expiresAt INTEGER NOT NULL
) STRICT;

INSERT INTO auth_space_invite_new
    (id, spaceId, email, role, invitedByUserId, createdAt, acceptedAt, tokenHash, expiresAt)
SELECT id, spaceId, email, role, invitedByUserId, createdAt, acceptedAt, NULL, 0
FROM auth_space_invite;

DROP TABLE auth_space_invite;
ALTER TABLE auth_space_invite_new RENAME TO auth_space_invite;

CREATE UNIQUE INDEX auth_space_invite_tokenHash ON auth_space_invite (tokenHash)
    WHERE tokenHash IS NOT NULL;
CREATE INDEX auth_space_invite_spaceId ON auth_space_invite (spaceId);
