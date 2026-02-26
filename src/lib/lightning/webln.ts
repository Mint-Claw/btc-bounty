/**
 * WebLN Adapter — Lightning payment via Alby or fallback to copy address.
 */

declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
      keysend(args: {
        destination: string;
        amount: string | number;
      }): Promise<{ preimage: string }>;
    };
  }
}

export function hasWebLN(): boolean {
  return typeof window !== "undefined" && !!window.webln;
}

export async function enableWebLN(): Promise<boolean> {
  if (!hasWebLN()) return false;
  try {
    await window.webln!.enable();
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy a Lightning address to clipboard.
 * Fallback when WebLN is not available.
 */
export async function copyLightningAddress(address: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(address);
    return true;
  } catch {
    return false;
  }
}
