export function unwrapCBOR(data: string) {
  const buffer = Buffer.from(data, "hex");

  const bytesLength = 2 ** ((buffer[0] & 0x1f) - 24);

  return buffer.toString("hex").slice(bytesLength * 2 + 2);
}
