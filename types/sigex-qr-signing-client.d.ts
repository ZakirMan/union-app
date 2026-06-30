declare module 'sigex-qr-signing-client' {
  export class QRSigningClientCMS {
    constructor(description: string, attach?: boolean, baseUrl?: string);
    addDataToSign(names: string[], data: string | Blob | ArrayBuffer, meta?: any[], isDocument?: boolean): Promise<void>;
    registerQRSinging(): Promise<string>;
    getEGovMobileLaunchLink(): string;
    getEGovBusinessLaunchLink(): string;
    getSignatures(): Promise<string[]>;
  }
}
