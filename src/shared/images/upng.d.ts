/* upng-js has no type definitions; this is the one function used.
   encode(frames, width, height, colours): colours 0 = lossless, otherwise
   the number of colours to reduce to (e.g. 256). */
declare module "upng-js" {
  const UPNG: {
    encode(
      frames: ArrayBuffer[],
      width: number,
      height: number,
      colours: number
    ): ArrayBuffer;
  };
  export default UPNG;
}
