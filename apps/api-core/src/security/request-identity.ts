import {
  adminAccessCookie,
  readBearerToken,
  readCookie,
  userAccessCookie
} from "./cookies.js";
import { verifyJwt } from "./jwt.js";
import type { HeaderRequestLike } from "./request-types.js";

export interface RequestIdentity {
  userId?: string;
  adminUserId?: string;
}

export function getRequestIdentity(request: HeaderRequestLike): RequestIdentity {
  const bearerToken = readBearerToken(request);
  const userToken = readCookie(request, userAccessCookie) ?? bearerToken;
  const adminToken = readCookie(request, adminAccessCookie) ?? bearerToken;
  const accessSecret = process.env.JWT_ACCESS_SECRET;

  if (!accessSecret) {
    return {};
  }

  if (adminToken) {
    const payload = verifyJwt(adminToken, accessSecret);

    if (payload?.type === "ADMIN") {
      return {
        adminUserId: payload.sub
      };
    }
  }

  if (userToken) {
    const payload = verifyJwt(userToken, accessSecret);

    if (payload?.type === "USER") {
      return {
        userId: payload.sub
      };
    }
  }

  return {};
}
