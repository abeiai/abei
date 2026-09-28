import Script, { type ScriptProps } from "next/script";
import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import React from "react";

interface AnalyticsCodeProps {
  code: string;
}

export interface AnalyticsScript {
  attributes: Record<string, string>;
  content: string;
}

const booleanAttributes = new Set(["async", "defer", "nomodule"]);
const reactAttributeNames: Record<string, string> = {
  charset: "charSet",
  crossorigin: "crossOrigin",
  fetchpriority: "fetchPriority",
  nomodule: "noModule",
  referrerpolicy: "referrerPolicy"
};

export function AnalyticsCode({ code }: AnalyticsCodeProps) {
  return parseAnalyticsScripts(code).map((script, index) => {
    const props = toScriptProps(script.attributes, index);

    return (
      <Script
        {...props}
        dangerouslySetInnerHTML={props.src ? undefined : { __html: script.content }}
        key={props.id}
        strategy="beforeInteractive"
      />
    );
  });
}

export function parseAnalyticsScripts(code: string): AnalyticsScript[] {
  const fragment = parseFragment(code.trim());
  const scripts: AnalyticsScript[] = [];

  collectScripts(fragment.childNodes, scripts);

  return scripts;
}

function collectScripts(nodes: DefaultTreeAdapterTypes.ChildNode[], scripts: AnalyticsScript[]) {
  for (const node of nodes) {
    if ("tagName" in node && node.tagName === "script") {
      scripts.push({
        attributes: Object.fromEntries(node.attrs.map((attribute) => [attribute.name, attribute.value])),
        content: serialize(node)
      });
      continue;
    }

    if ("childNodes" in node) {
      collectScripts(node.childNodes, scripts);
    }
  }
}

function toScriptProps(attributes: Record<string, string>, index: number): ScriptProps {
  const props: ScriptProps = {
    id: attributes.id || `xueleai-analytics-${index + 1}`
  };
  const mutableProps = props as Record<string, unknown>;

  for (const [name, value] of Object.entries(attributes)) {
    if (name === "id") {
      continue;
    }

    const propertyName = reactAttributeNames[name] ?? name;
    mutableProps[propertyName] = booleanAttributes.has(name) ? true : value;
  }

  return props;
}
