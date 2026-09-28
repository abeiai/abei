export const sensitivePatterns = [
  {
    name: "疑似真实 OpenAI API Key",
    pattern: /\bsk-(?:live|proj)-[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: "疑似 ElevenLabs API Key",
    pattern: /\bsk_[A-Za-z0-9_-]{32,}\b/
  },
  {
    name: "疑似 AWS Access Key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    name: "疑似 Stripe Live Key",
    pattern: /\b(?:sk|pk)_live_[A-Za-z0-9]{20,}\b/
  },
  {
    name: "疑似真实支付商户号",
    pattern: /\b(?:WECHAT_PAY_MCH_ID|ALIPAY_APP_ID)\s*[:=]\s*["']?\d{8,}["']?/
  }
];

export function findSensitivePatternNames(content) {
  return sensitivePatterns
    .filter(({ pattern }) => pattern.test(content))
    .map(({ name }) => name);
}
