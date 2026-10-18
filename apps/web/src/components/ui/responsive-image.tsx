"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { imageSources, type ImageUsage } from "../../lib/image-delivery";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & { src: string; usage?: ImageUsage };

export function ResponsiveImage(props: Props) {
  return <ImageSource key={props.src} {...props} />;
}

function ImageSource({ src, usage = "card", sizes, onError, loading = "lazy", decoding = "async", ...props }: Props) {
  const [original, setOriginal] = useState(false);
  const sources = imageSources(src, usage);
  return <img {...props} src={original ? src : sources.src} srcSet={original ? undefined : sources.srcSet}
    sizes={original ? undefined : sizes ?? sources.sizes} loading={loading} decoding={decoding}
    onError={event => { if (!original && sources.src !== src) setOriginal(true); else onError?.(event); }} />;
}
