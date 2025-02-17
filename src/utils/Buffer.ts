export function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const buffer = new Uint8Array(
    buffers.reduce((acc, buf) => acc + buf.length, 0),
  );

  buffers.reduce((offset, buf) => {
    buffer.set(buf, offset);
    return offset + buf.length;
  }, 0);

  return buffer;
}
