export interface ClaimsVerifier {
  verify(requiredClaims: string[], context: any): Promise<{ ok: boolean; reason?: string }>;
}

export class NoneVerifier implements ClaimsVerifier {
  async verify(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: true };
  }
}

export class HttpVerifier implements ClaimsVerifier {
  constructor(private url: string) {}

  async verify(
    requiredClaims: string[],
    context: any
  ): Promise<{ ok: boolean; reason?: string }> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requiredClaims, context }),
    });

    if (!res.ok) {
      const message = await res.text();
      return { ok: false, reason: message || res.statusText };
    }

    const data = (await res.json()) as { ok: boolean; reason?: string };
    return { ok: data.ok, reason: data.reason };
  }
}
