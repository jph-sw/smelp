-- MCP clients that registered themselves to sign people in with OAuth. They are
-- public clients with no secret, so a client is only its name and where it may
-- send people back to. redirectUris is a JSON array of exact addresses.
CREATE TABLE oauth_client (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    redirectUris TEXT NOT NULL,
    createdAt INTEGER NOT NULL
) STRICT;

-- Authorization codes, handed to a client once a person allows it and traded for
-- tokens within minutes. Only a hash is kept, and a code is deleted when it's used.
-- codeChallenge is the PKCE S256 challenge the client's verifier has to match.
CREATE TABLE oauth_code (
    codeHash TEXT NOT NULL PRIMARY KEY,
    clientId TEXT NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    redirectUri TEXT NOT NULL,
    codeChallenge TEXT NOT NULL,
    expiresAt INTEGER NOT NULL
) STRICT;

-- A person's OAuth grant to a client is an API token too, so it shows up next to
-- their personal tokens and revoking it signs the client out. These stay NULL for
-- personal tokens. clientId is the client the grant belongs to, refreshHash the
-- hash of its refresh token, and secretExpiresAt when its access token stops
-- working, which a refresh pushes back.
ALTER TABLE api_token ADD COLUMN clientId TEXT REFERENCES oauth_client(id) ON DELETE CASCADE;
ALTER TABLE api_token ADD COLUMN refreshHash TEXT;
ALTER TABLE api_token ADD COLUMN secretExpiresAt INTEGER;

CREATE UNIQUE INDEX api_token_refreshHash ON api_token (refreshHash);
CREATE INDEX api_token_clientId ON api_token (clientId);
