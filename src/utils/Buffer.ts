export function concatBuffers(buffers: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const buffer = new Uint8Array(buffers.reduce((acc, buf) => acc + buf.length, 0));

  buffers.reduce((offset, buf) => {
    buffer.set(buf, offset);
    return offset + buf.length;
  }, 0);

  return buffer;
}
