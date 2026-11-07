import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** The signed-in user as the session endpoints return them. */
export interface SessionUser {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  timezone: string;
  createdAt: Date;
  shareStatsWithCollaborators: boolean;
}

export interface RegisterBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
}

export interface RegisterVerifyResponse {
  success: true;
  user: Pick<
    SessionUser,
    "id" | "username" | "profilePictureUrl" | "timezone" | "createdAt"
  >;
  credential: { id: string; deviceName: string | null; createdAt: Date };
}

export interface AuthenticateBeginResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
}

export interface AuthenticateVerifyResponse {
  success: true;
  user: Pick<SessionUser, "id" | "username" | "createdAt">;
  credential: { id: string; deviceName: string | null; lastUsed: Date };
}

export interface ClaimBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeToken: string;
}
