import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Provider keys saved from the dashboard are sealed with a key derived from AUTH_SECRET.
function key(purpose: string) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required to protect saved provider keys.");
  return createHash("sha256").update(`elayo-${purpose}:${process.env.AUTH_SECRET}`).digest();
}
export function sealSecret(purpose: string, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
export function openSecret(purpose: string, encrypted: string) {
  const [version, iv, content, tag] = encrypted.split(".");
  if (version !== "v1" || !iv || !content || !tag) throw new Error("Invalid encrypted key.");
  const cipher = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(content, "base64url")), cipher.final()]).toString("utf8");
}
