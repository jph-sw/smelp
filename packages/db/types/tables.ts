export type schema_migrations = {
  id: string,
  name: string,
  checksum: string,
  applied_at: number,
  execution_ms: number
}

export type auth_session = {
  id: string,
  userId: string,
  secretHash: Uint8Array,
  tokenLastVerifiedAt: number;
  createdAt: number;
}

export type auth_user = {
  id: string,
  user: string,
  email: string,
  image?: string,
  createdAt: number,
  updatedAt: number
}
