/**
 * Droply's zero-key support guide.
 *
 * Deterministic, short answers grounded in the product description.
 * This is NOT a language model; it needs no provider, key or inference billing.
 * Chat messages are processed transiently by the Edge Function and are not saved.
 */
export function getSupportReply(message) {
  const text = typeof message === "string" ? message.toLowerCase().replace(/\s+/g, " ").trim() : "";
  const has = re => re.test(text);
  if (!text) return "Tell me what you need help with. I can guide you through downloads, connecting to a person, transfer issues, encryption and keys. You can also create a support ticket.";

  // Human requests or potentially sensitive/security-critical requests first.
  if (has(/\b(human|real person|talk to (someone|support)|contact support|support ticket|report (a|an) (issue|bug)|bug report|raise (a|an) ticket)\b/))
    return "You can reach the team directly: select “Create support ticket” in this chat, describe what happened, add your name and email, then press Submit ticket. You'll get a reference when the request is saved. Don't include passwords or private keys.";

  if (has(/\b(private key|secret key|seed phrase|recovery phrase)\b/) && has(/\b(expos|leak|stol|shar|compromis|send|paste|revea|hack|protect|safety|safe)\w*/))
    return "Never share your private key. If you think someone else has it, treat that identity as potentially compromised and use “Create support ticket” to contact the team. Don't paste the key into the ticket.";

  if (has(/\b(lost|lose|forgot|deleted|missing|recover|reset|restore)\b/) && has(/\b(key|identity|device)\b/))
    return "If your device identity or private key is lost, it may not be recoverable. You may need to create a new identity and exchange public keys with your contacts again. A team member can review your situation through “Create support ticket”.";

  if (has(/\b(crash|crashing|crashed|freeze|frozen|blank screen|bug|broken|data loss|file gone|corrupt|malware|virus|compromised)\b/))
    return "That needs a closer look. Please try reopening Droply once and note your operating system, app version and the exact error. Then select “Create support ticket” so the team can investigate. Don't include private keys or file contents.";

  if (has(/\b(offline|not online|not showing|not appear|can't see|cannot see|can't find|cannot find|unavailable|friend.*(disappear|missing)|peer.*(disappear|missing))\b/))
    return "Both people need Droply open and an internet connection. Check that both have approved each other's public keys, neither device is asleep, and the connection is stable. Is the other person still showing as offline?";

  if (has(/\b(vpn|firewall|proxy|school network|work network|office network|hotspot|blocked connection)\b/))
    return "Some managed networks, VPNs or firewalls can affect connections. Confirm that both people are online and trusted, then try a normal, trusted network if one is available. Don't switch off your firewall or security tools; ask your network administrator if a managed network is involved.";

  if (has(/\b(slow|speed|bandwidth|lag|throughput|takes too long|very long|how fast)\b/))
    return "Transfer speed depends on the sender's upload speed, the recipient's download speed, Wi‑Fi quality and other network traffic. Keep both devices awake and, if possible, try a steadier connection. Is the slowdown on every file or just one?";

  if (has(/\b(stuck|stall|paused|pause|fail|error|disconnect|interrupted|resume|restart transfer|transfer stopped|not sending)\b/))
    return "Keep Droply open on both devices, check that both people are online and have free disk space, and look at the transfer's progress or any error message. If it repeatedly stops, make a support ticket with the OS, version and exact error (not the file contents).";

  if (has(/\b(install|installer|download|dmg|exe|windows|macos|mac os|macbook|apple silicon|intel|setup|compatible)\b/))
    return "Download Droply from the official Download section of this website. The current downloads shown are version 2.8.2 for macOS 12+ (universal .dmg) and Windows 10+ 64-bit (.exe). Which system are you using, and what happens when you install?";

  if (has(/\b(qr|scan|public key|exchange|approve|trusted|pair|pairing|connect with|add (a|my) (friend|person|contact)|invite|friend)\b/))
    return "On first launch, Droply creates your device identity. Exchange PUBLIC keys with the person you want to connect to, then approve each other's key. When you're both online, you can choose them as a recipient. Never share your private key.";

  if (has(/\b(offline transfer|send offline|both online|same time|other person online)\b/))
    return "Both people must be online at the same time for a direct transfer. Droply doesn't upload your file to a cloud account for someone to collect later.";

  if (has(/\b(size|limit|large|gigabyte|gb|terabyte|tb|file type|folder|format|any file|too big)\b/))
    return "Droply doesn't impose a server-side file size limit. The practical limits come from the available disk space, network quality and transfer time. You can send different file types; if a specific transfer fails, tell me what happened.";

  if (has(/\b(encrypt|private|privacy|secure|security|cloud|server|stored|middleman|end.to.end|direct)\b/))
    return "Droply sends files directly between approved people with end-to-end encryption, rather than storing them in a third-party cloud. Your private identity key stays on your device. Avoid sharing that private key with anyone.";

  if (has(/\b(free|price|pricing|cost|pay|paid|subscription|account|register|sign up|email needed|password needed)\b/))
    return "Droply is free to use. The desktop app doesn't require an account, email address or password: it identifies devices using cryptographic keys. The newsletter and support forms are separate from file transfers.";

  if (has(/\b(help|how does|how to|what is|what can|hello|hi|hey|thanks|thank you)\b/))
    return "I can help with installing Droply, exchanging public keys, seeing an offline person, stalled transfers, speed, file sizes and encryption. What would you like to troubleshoot? You can also create a support ticket for a person to review.";

  return "I don't have a reliable step-by-step answer for that specific problem. I can help with installing, trusted contacts, transfers, encryption and file sizes. You can also select “Create support ticket” for a person to review your issue.";
}
