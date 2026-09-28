export const dialogueDownloadMaxBytes = 100 * 1024 * 1024;

export function boundedDialogueDownload(source: ReadableStream<Uint8Array>, maximumBytes = dialogueDownloadMaxBytes) {
  let receivedBytes = 0;
  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maximumBytes) throw new Error("音频文件超过大小限制");
      controller.enqueue(chunk);
    }
  }));
}
