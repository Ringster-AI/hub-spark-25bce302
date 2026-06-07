
// Global token-bucket limiter (per warm function instance) to protect against Vapi 429s
// when many users save agents at once. Conservative defaults; tune via env.
const RATE_PER_SEC = Number(process.env.VAPI_RATE_PER_SEC || 5);
const BUCKET_CAPACITY = Number(process.env.VAPI_RATE_BURST || 10);

let tokens = BUCKET_CAPACITY;
let lastRefill = Date.now();

async function acquireToken(): Promise<void> {
  while (true) {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000;
    if (elapsed > 0) {
      tokens = Math.min(BUCKET_CAPACITY, tokens + elapsed * RATE_PER_SEC);
      lastRefill = now;
    }
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    const waitMs = Math.ceil(((1 - tokens) / RATE_PER_SEC) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

export class VapiBaseService {
  protected apiKey: string;
  protected apiUrl: string;

  constructor(apiKey: string, apiUrl: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  protected async makeRequest(url: string, method: string, body?: any) {
    console.log(`Making ${method} request to ${url}`);

    const maxAttempts = 4;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt++;
      await acquireToken();

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        lastError = err;
        // Network error — exponential backoff with jitter
        const delay = Math.min(8000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 150);
        if (attempt >= maxAttempts) break;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (response.ok) {
        return await response.json();
      }

      // Retry on 429 + 5xx; respect Retry-After when present
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) : 0;
        const backoff = Math.min(8000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 150);
        const delay = Math.max(retryAfterMs, backoff);
        const bodyText = await response.text().catch(() => '');
        lastError = new Error(`Request failed (${response.status}): ${bodyText.slice(0, 200)}`);
        console.warn(`Vapi ${response.status} on attempt ${attempt}; retrying in ${delay}ms`);
        if (attempt >= maxAttempts) break;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const errorText = await response.text();
      console.error(`Request failed: ${errorText}`);
      throw new Error(`Request failed: ${errorText}`);
    }

    throw lastError instanceof Error ? lastError : new Error('Vapi request failed after retries');
  }
}
