-- Accounts made through public sign-up on an instance with email can start out
-- unverified. Every account that exists today, and every other way of making one,
-- counts as verified, hence the default of 1.
ALTER TABLE auth_user ADD COLUMN emailVerified INTEGER NOT NULL DEFAULT 1;

-- Single-use links that confirm an address. Only a hash of the link is kept. The
-- address is stored too, so a link can only confirm the address it was sent to.
CREATE TABLE auth_email_verification (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    usedAt INTEGER
) STRICT;

CREATE INDEX auth_email_verification_userId ON auth_email_verification (userId);
