export function forgotPasswordLoginHref(next?: string | null) {
  const searchParams = new URLSearchParams();
  const safeNext = safeNextPath(next);

  if (safeNext) {
    searchParams.set("next", safeNext);
  }

  searchParams.set("reset", "1");

  return `/login?${searchParams.toString()}`;
}

export function passwordConfirmationError(password: string, confirmPassword: string, minimumLength = 8) {
  if (password.length < minimumLength) {
    return `密码至少 ${minimumLength} 位`;
  }

  if (password !== confirmPassword) {
    return "两次输入的密码不一致";
  }

  return null;
}

export function safeNextPath(value: string | null | undefined) {
  const next = value?.trim();

  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/admin")) {
    return "";
  }

  return next;
}
