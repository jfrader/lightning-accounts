// src/services/walletLock.ts
const busyWallets = new Set<number>()

/**
 * Set a wallet as busy
 * @param walletId - Wallet ID
 * @returns {boolean} - True if the wallet was successfully marked busy, false if already busy
 */
export const setWalletBusy = (walletId: number): boolean => {
  if (busyWallets.has(walletId)) {
    return false
  }
  busyWallets.add(walletId)
  return true
}

/**
 * Clear a wallet's busy state
 * @param walletId - Wallet ID
 */
export const clearWalletBusy = (walletId: number): void => {
  busyWallets.delete(walletId)
}

/**
 * Check if a wallet is busy
 * @param walletId - Wallet ID
 * @returns {boolean} - True if the wallet is busy
 */
export const isWalletBusy = (walletId: number): boolean => {
  return busyWallets.has(walletId)
}
