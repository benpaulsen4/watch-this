/** Why a passkey ceremony failed, for the routes to map to their error codes. */
export type PasskeyFailure =
  | "usernameTaken"
  | "verificationFailed"
  | "maxDevices"
  | "credentialNotFound";

/**
 * Thrown by the WebAuthn helpers for failures a route reports to the user.
 * Routes branch on `code`, so rewording a message cannot turn a 400 or 409
 * into a 500. Anything else they throw is unexpected and becomes a 500.
 */
export class PasskeyError extends Error {
  constructor(
    readonly code: PasskeyFailure,
    message: string,
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}
