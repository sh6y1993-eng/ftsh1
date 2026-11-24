import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const APPLE_JWKS_URI = new URL('https://appleid.apple.com/auth/keys');
export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_BUNDLE_AUDIENCE = 'com.fatteshha.kuwaitgame';

const defaultAppleJwks = createRemoteJWKSet(APPLE_JWKS_URI, {
  timeoutDuration: 8000,
  cooldownDuration: 30000
});

export interface VerifiedAppleClaims {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  isPrivateEmail?: boolean;
  aud: string | string[];
  iss: string;
  iat: number;
  exp: number;
  nonce?: string;
}

export class AppleAuthVerificationError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppleAuthVerificationError';
  }
}

export function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export async function verifyAppleIdentityToken(params: {
  identityToken: unknown;
  rawNonce?: unknown;
  expectedAudience?: string;
  keyResolver?: JWTVerifyGetKey | crypto.KeyObject | CryptoKey | Uint8Array;
}): Promise<VerifiedAppleClaims> {
  const { identityToken, rawNonce, expectedAudience = APPLE_BUNDLE_AUDIENCE, keyResolver } = params;

  if (typeof identityToken !== 'string' || !identityToken.trim()) {
    throw new AppleAuthVerificationError('MISSING_TOKEN', 'رمز مصادقة Apple مفقود');
  }

  const token = identityToken.trim();
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some(s => !s.length)) {
    throw new AppleAuthVerificationError('MALFORMED_TOKEN', 'صيغة رمز مصادقة Apple غير صالحة');
  }

  try {
    const verifyTarget = keyResolver || defaultAppleJwks;
    const { payload } = await jwtVerify(
      token,
      verifyTarget as any,
      {
        issuer: APPLE_ISSUER,
        audience: expectedAudience,
        algorithms: ['RS256']
      }
    );

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new AppleAuthVerificationError('MISSING_SUB', 'معرّف المستخدم sub مفقود في رمز Apple');
    }

    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
      throw new AppleAuthVerificationError('MISSING_TIMESTAMPS', 'طوابع الصلاحية الزمنية غير مكتملة في رمز Apple');
    }

    if (typeof rawNonce === 'string' && rawNonce.trim()) {
      const expectedNonceHash = sha256Hex(rawNonce.trim());
      const tokenNonce = typeof payload.nonce === 'string' ? payload.nonce : '';
      const a = Buffer.from(tokenNonce, 'utf8');
      const b = Buffer.from(expectedNonceHash, 'utf8');
      if (!tokenNonce || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new AppleAuthVerificationError('NONCE_MISMATCH', 'تعذر التحقق من nonce الخاص بجلسة Apple');
      }
    }

    const email =
      typeof payload.email === 'string' && payload.email.includes('@')
        ? payload.email.trim().toLowerCase()
        : undefined;

    return {
      sub: payload.sub.trim(),
      email,
      emailVerified:
        payload.email_verified === true || payload.email_verified === 'true' ? true : undefined,
      isPrivateEmail:
        payload.is_private_email === true || payload.is_private_email === 'true' ? true : undefined,
      aud: payload.aud as string | string[],
      iss: String(payload.iss),
      iat: payload.iat,
      exp: payload.exp,
      nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined
    };
  } catch (err: any) {
    if (err instanceof AppleAuthVerificationError) {
      throw err;
    }
    throw new AppleAuthVerificationError(
      'INVALID_SIGNATURE_OR_CLAIMS',
      'فشل التحقق التشفيري من توقيع أو صلاحية رمز Apple'
    );
  }
}
