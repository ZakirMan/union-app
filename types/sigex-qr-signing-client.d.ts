declare module 'sigex-qr-signing-client' {
  export class QRSigningClientCMS {
    constructor(description: string, attach?: boolean, baseUrl?: string);
    addDataToSign(names: string[], dataBase64: string, meta?: any[], isDocument?: boolean): Promise<void>;
    registerQRSinging(): Promise<string>;
    getEGovMobileLaunchLink(): string;
    getEGovBusinessLaunchLink(): string;
    getSignatures(): Promise<string[]>;
  }
}
