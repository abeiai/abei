export function publicEmailLabel(email: string) {
  return /@users\.(?:xueleai|abei)\.local$/.test(email) ? "未绑定邮箱" : email;
}

export function publicAccountLabel(user: {
  email: string;
  phone: string | null;
  nickname: string;
}) {
  if (!/@users\.(?:xueleai|abei)\.local$/.test(user.email)) {
    return user.email;
  }
  if (user.phone) {
    return `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}`;
  }
  return user.nickname.trim() || "微信用户";
}

export function accountProfileIdentityRows(user: { accountId: string; nickname: string }) {
  return [
    { key: "accountId" as const, label: "主账号 ID", value: user.accountId },
    { key: "nickname" as const, label: "昵称", value: user.nickname || "未设置" }
  ];
}
