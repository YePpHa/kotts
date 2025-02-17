declare module "*.css" {
  const content: string;
  export default content;
}

declare module "@ffmpeg/core-mt" {
  const content: Uint8Array;
  export default content;
}

declare module "@ffmpeg/core-mt/wasm" {
  const content: Uint8Array;
  export default content;
}