/**
 * Token encryption utilities using AES-GCM with salted key derivation.
 * Provides secure encryption/decryption for OAuth tokens stored in the database.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

/**
 * Derives an encryption key from the master key and a unique salt using PBKDF2.
 */
async function deriveKey(masterKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a token using AES-GCM with a random salt and IV.
 * Returns a base64-encoded string containing: salt + iv + ciphertext
 * 
 * @param token - The plaintext token to encrypt
 * @param masterKey - The master encryption key from environment
 * @returns Base64-encoded encrypted token with salt and IV prepended
 */
export async function encryptToken(token: string, masterKey: string): Promise<string> {
  if (!token) {
    throw new Error('Token is required for encryption');
  }
  
  if (!masterKey) {
    throw new Error('Encryption key is required');
  }

  const encoder = new TextEncoder();
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Derive key from master key and salt
  const key = await deriveKey(masterKey, salt);
  
  // Encrypt the token
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH
    },
    key,
    encoder.encode(token)
  );
  
  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
  
  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts an encrypted token using AES-GCM.
 * Expects a base64-encoded string containing: salt + iv + ciphertext
 * 
 * @param encryptedToken - Base64-encoded encrypted token
 * @param masterKey - The master encryption key from environment
 * @returns The decrypted plaintext token
 */
export async function decryptToken(encryptedToken: string, masterKey: string): Promise<string> {
  if (!encryptedToken) {
    throw new Error('Encrypted token is required for decryption');
  }
  
  if (!masterKey) {
    throw new Error('Encryption key is required');
  }

  const decoder = new TextDecoder();
  
  // Decode from base64
  const combined = new Uint8Array(
    atob(encryptedToken)
      .split('')
      .map(c => c.charCodeAt(0))
  );
  
  // Extract salt, iv, and ciphertext
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
  
  // Derive key from master key and salt
  const key = await deriveKey(masterKey, salt);
  
  // Decrypt the token
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH
    },
    key,
    ciphertext
  );
  
  return decoder.decode(decrypted);
}

/**
 * Checks if a token appears to be encrypted (base64-encoded with proper length).
 * This is a heuristic check - encrypted tokens have a minimum length due to salt + IV.
 * 
 * @param token - The token to check
 * @returns True if the token appears to be encrypted
 */
export function isEncrypted(token: string): boolean {
  if (!token) return false;
  
  try {
    // Try to decode as base64
    const decoded = atob(token);
    // Encrypted tokens have at least salt + iv + some ciphertext
    // Minimum length: 16 (salt) + 12 (iv) + 16 (min ciphertext with tag) = 44 bytes
    return decoded.length >= 44;
  } catch {
    // Not valid base64, so not encrypted
    return false;
  }
}
