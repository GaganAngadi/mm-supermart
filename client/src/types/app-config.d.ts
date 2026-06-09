export {};

declare global {
  interface Window {
    __MM_SUPERMART_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}
