-- Signing in with an outside identity provider adds auth_account rows whose
-- providerId is "oidc:<issuer>" and whose accountId is the provider's `sub`.
-- One outside identity can belong to only one person, and one person can have only
-- one identity per provider. Enforced here so two callbacks finishing at the same
-- moment can't make two accounts for one `sub`.
CREATE UNIQUE INDEX auth_account_oidc_identity ON auth_account (providerId, accountId)
    WHERE providerId LIKE 'oidc:%';
CREATE UNIQUE INDEX auth_account_oidc_user ON auth_account (userId, providerId)
    WHERE providerId LIKE 'oidc:%';
