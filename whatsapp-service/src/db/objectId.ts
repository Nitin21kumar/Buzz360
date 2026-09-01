import { randomBytes } from "crypto";

let counter = Math.floor(Math.random() * 0xffffff);

export function newObjectId(): string {
  const time = Math.floor(Date.now() / 1000);
  const timeHex = time.toString(16).padStart(8, "0");
  const randomHex = randomBytes(5).toString("hex");
  counter = (counter + 1) % 0xffffff;
  const counterHex = counter.toString(16).padStart(6, "0");
  return `${timeHex}${randomHex}${counterHex}`;
}

export function isValidObjectId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
