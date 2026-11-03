import { Fragment } from "react";

export function PictureBookSourceStatement({ text }: { text: string }) {
  const parts = text.split("CC BY 4.0");
  return <>{parts.map((part, index) => <Fragment key={index}>{index > 0 ? <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> : null}{part}</Fragment>)}</>;
}
