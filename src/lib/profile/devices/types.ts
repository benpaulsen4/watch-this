export interface PasskeyDevice {
  id: string;
  credentialId: string;
  deviceName: string | null;
  createdAt: string;
  lastUsed: string | null;
}

export type ClaimInitiator = "user" | "admin";

export interface ClaimInitiateResponse {
  claimId: string;
  claimCode: string;
  token: string;
  magicLink: string;
  qrPayload: string;
  expiresAt: string;
}

export interface ClaimBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeToken: string;
}

export interface ClaimVerifyRequest {
  token: string;
  challengeToken: string;
  registrationResponse: unknown;
  deviceName?: string;
}
