export interface PasskeyDevice {
  id: string;
  credentialId: string;
  deviceName: string | null;
  createdAt: string;
  lastUsed: string | null;
}
