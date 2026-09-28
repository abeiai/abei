import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Heart, Shield, Sparkles, Star, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContentModule } from "@/lib/content-module-api";

type TextStyle = {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
};

const iconMap = {
  Sparkles,
  Check,
  Star,
  Zap,
  Shield,
  Heart
};

export function PublicModuleRenderer({ modules }: { modules: ContentModule[] }) {
  if (modules.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {modules.map((module) => (
        <RenderedModule key={module.id} module={module} />
      ))}
    </div>
  );
}

function RenderedModule({ module }: { module: ContentModule }) {
  if (module.type === "SLIDESHOW") {
    return <SlideshowModule module={module} />;
  }

  if (module.type === "IMAGE_CARD_LIST") {
    return <ImageCardListModule module={module} />;
  }

  return <SplitImageTextModule module={module} />;
}

function SlideshowModule({ module }: { module: ContentModule }) {
  const opacity = Math.min(Math.max(numberValue(module.settings.opacity, 100), 0), 100) / 100;

  return (
    <section className="w-full bg-background">
      <div className="w-full">
        <div className="flex snap-x overflow-x-auto">
          {module.items.map((item) => {
            const config = item.config ?? {};
            const introText = textStyle(config.introText);
            const titleText = textStyle(config.titleText);
            const descriptionText = textStyle(config.descriptionText);
            const textRight = String(config.textPosition ?? "LEFT") === "RIGHT";
            const buttonText = stringValue(config.buttonText);
            const buttonLink = stringValue(config.buttonLink);
            const buttonTextColor = colorValue(config.buttonTextColor, "#ffffff");
            const buttonBgColor = colorValue(config.buttonBgColor, "#111827");
            const imagePositionClass = textRight ? "object-center lg:object-left" : "object-center lg:object-right";
            const textPlacementClass = textRight
              ? "lg:ml-auto lg:items-end lg:text-right"
              : "lg:mr-auto lg:items-start lg:text-left";

            return (
              <div className="relative w-full min-w-0 flex-none snap-start overflow-hidden bg-secondary" key={item.id}>
                {item.imageUrl ? (
                  <img
                    alt={item.imageAlt ?? item.title ?? ""}
                    className={`absolute inset-0 size-full object-cover ${imagePositionClass}`}
                    src={item.imageUrl}
                    style={{ opacity }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-secondary" />
                )}
                <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/70 to-background/20 lg:hidden" />
                <div
                  aria-hidden
                  className={
                    textRight
                      ? "absolute inset-0 hidden bg-gradient-to-l from-background/95 via-background/65 to-transparent lg:block"
                      : "absolute inset-0 hidden bg-gradient-to-r from-background/95 via-background/65 to-transparent lg:block"
                  }
                />
                <div className="relative z-10 mx-auto flex min-h-[560px] w-full max-w-[1600px] items-center px-6 py-16 sm:min-h-[620px] sm:px-10 lg:min-h-[640px] lg:px-14 lg:py-20 xl:min-h-[700px] xl:px-16 2xl:px-20">
                  <div className={`flex min-w-0 w-full max-w-[21rem] flex-col items-start gap-5 text-left text-foreground md:max-w-[35rem] ${textPlacementClass}`}>
                    {introText.text ? <TextBlock value={introText} className="font-medium" /> : null}
                    {titleText.text ? <ResponsiveTitleBlock value={titleText} className="font-display leading-tight" /> : null}
                    {descriptionText.text ? <TextBlock value={descriptionText} className="leading-7" /> : null}
                    {buttonText ? (
                      <div className={textRight ? "flex lg:justify-end" : "flex"}>
                        <Button asChild>
                          <Link
                            href={buttonLink || item.resolvedHref || "#"}
                            style={{
                              backgroundColor: buttonBgColor,
                              color: buttonTextColor
                            }}
                          >
                            {buttonText}
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ImageCardListModule({ module }: { module: ContentModule }) {
  const cardsPerRow = numberValue(module.settings.cardsPerRow, 3);
  const textPosition = String(module.settings.textPosition ?? "BELOW_IMAGE");
  const fontSize = numberValue(module.settings.fontSize, 18);

  return (
    <section className="bg-background">
      <div className="w-full px-5 py-12">
        <div className={gridClass(cardsPerRow)}>
          {module.items.map((item) => (
            <ModuleLink className="xueleai-card group overflow-hidden rounded-md border border-border bg-card" href={item.resolvedHref} key={item.id}>
              <div className="relative aspect-[4/3] bg-secondary">
                {item.imageUrl ? (
                  <img alt={item.imageAlt ?? item.title ?? ""} className="size-full object-cover transition-transform group-hover:scale-[1.02]" src={item.imageUrl} />
                ) : null}
                {textPosition !== "BELOW_IMAGE" && item.title ? (
                  <div className={textPosition === "IMAGE_MIDDLE" ? "absolute inset-0 flex items-center justify-center bg-foreground/30 p-4 text-center text-primary-foreground" : "absolute inset-x-0 bottom-0 bg-foreground/55 p-4 text-primary-foreground"}>
                    <p className="font-medium" style={{ fontSize }}>{item.title}</p>
                  </div>
                ) : null}
              </div>
              {textPosition === "BELOW_IMAGE" && item.title ? (
                <div className="p-4">
                  <p className="font-medium" style={{ fontSize }}>{item.title}</p>
                </div>
              ) : null}
            </ModuleLink>
          ))}
        </div>
      </div>
    </section>
  );
}

function SplitImageTextModule({ module }: { module: ContentModule }) {
  const settings = module.settings ?? {};
  const legacyItem = {
    id: `${module.id}-legacy`,
    title: null,
    imageUrl: stringValue(settings.imageUrl),
    imageAlt: stringValue(settings.imageAlt),
    config: settings
  };
  const items = (
    module.items.length > 0
      ? module.items
      : hasSplitContent(legacyItem.imageUrl, settings, settings)
        ? [legacyItem]
        : []
  ).filter((item) => hasSplitContent(item.imageUrl ?? "", item.config ?? {}, settings));

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="bg-background">
      {items.map((item) => (
        <SplitImageTextRow
          key={item.id}
          imageAlt={item.imageAlt ?? item.title ?? ""}
          imageUrl={item.imageUrl ?? ""}
          settings={settings}
          config={item.config ?? {}}
        />
      ))}
    </section>
  );
}

function hasSplitContent(
  imageUrl: string,
  config: Record<string, unknown>,
  settings: Record<string, unknown>
) {
  const rawIconItems = config.iconItems ?? settings.iconItems;
  const iconItems: unknown[] = Array.isArray(rawIconItems)
    ? rawIconItems
    : [];

  return Boolean(
    imageUrl ||
      textStyle(config.introText ?? settings.introText).text ||
      textStyle(config.titleText ?? settings.titleText).text ||
      textStyle(config.descriptionText ?? settings.descriptionText).text ||
      stringValue(config.buttonText ?? settings.buttonText) ||
      iconItems.some((item) => stringValue(recordValue(item).text))
  );
}

function SplitImageTextRow({
  imageAlt,
  imageUrl,
  settings,
  config
}: {
  imageAlt: string;
  imageUrl: string;
  settings: Record<string, unknown>;
  config: Record<string, unknown>;
}) {
  const imageLeft = String(config.layout ?? settings.layout ?? "TEXT_LEFT_IMAGE_RIGHT") === "IMAGE_LEFT_TEXT_RIGHT";
  const textMode = String(config.textMode ?? settings.textMode ?? "TITLE_TEXT");
  const imageRatio = String(config.imageRatio ?? settings.imageRatio ?? "16:9");
  const gridColumnsClass = imageLeft
    ? "lg:grid-cols-[minmax(0,0.94fr)_minmax(0,0.86fr)]"
    : "lg:grid-cols-[minmax(0,0.86fr)_minmax(0,0.94fr)]";
  const textPlacementClass = imageLeft ? "lg:justify-self-end" : "lg:justify-self-start";
  const imagePlacementClass = imageLeft ? "lg:justify-self-start" : "lg:justify-self-end";
  const imageOrderClass = imageLeft ? "order-1 lg:order-1" : "order-1 lg:order-2";
  const textOrderClass = imageLeft ? "order-2 lg:order-2" : "order-2 lg:order-1";
  const buttonText = stringValue(config.buttonText ?? settings.buttonText);
  const buttonLink = stringValue(config.buttonLink ?? settings.buttonLink);
  const buttonTextColor = colorValue(config.buttonTextColor ?? settings.buttonTextColor, "#ffffff");
  const buttonBgColor = colorValue(config.buttonBgColor ?? settings.buttonBgColor, "#111827");
  const image = (
    <div className={`relative w-full max-w-[660px] overflow-hidden rounded-md bg-transparent ${imageOrderClass} ${imagePlacementClass} ${ratioClass(imageRatio)}`}>
      {imageUrl ? (
        <img alt={imageAlt} className="size-full object-contain" src={imageUrl} />
      ) : null}
    </div>
  );
  const text = (
    <div className={`flex w-full max-w-[35rem] flex-col justify-center gap-6 ${textOrderClass} ${textPlacementClass}`}>
      {textMode === "ICON_LIST" ? (
        <IconList value={config.iconItems ?? settings.iconItems} />
      ) : (
        <>
          {textStyle(config.introText ?? settings.introText).text ? <TextBlock value={textStyle(config.introText ?? settings.introText)} className="font-medium text-primary" /> : null}
          {textStyle(config.titleText ?? settings.titleText).text ? <ResponsiveTitleBlock value={textStyle(config.titleText ?? settings.titleText)} className="text-balance font-display leading-tight tracking-normal" /> : null}
          {textStyle(config.descriptionText ?? settings.descriptionText).text ? <TextBlock value={textStyle(config.descriptionText ?? settings.descriptionText)} className="text-pretty leading-8 text-muted-foreground" /> : null}
        </>
      )}
      {buttonText ? (
        <div className="flex">
          <Button asChild>
            <Link
              href={buttonLink || "#"}
              style={{
                backgroundColor: buttonBgColor,
                color: buttonTextColor
              }}
            >
              {buttonText}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={`mx-auto grid w-full max-w-[1600px] items-center gap-y-12 px-6 py-24 sm:px-10 lg:gap-x-20 lg:px-14 lg:py-28 xl:gap-x-28 xl:px-16 2xl:px-20 ${gridColumnsClass}`}>
      {image}
      {text}
    </div>
  );
}

function IconList({ value }: { value: unknown }) {
  const items = Array.isArray(value) ? value : [];

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, index) => {
        const record = recordValue(item);
        const Icon = iconMap[stringValue(record.icon) as keyof typeof iconMap] ?? Sparkles;
        const text = stringValue(record.text);

        return text ? (
          <div className="flex items-start gap-3" key={`${text}-${index}`}>
            <span className="xueleai-icon-tile flex size-10 items-center justify-center rounded-md">
              <Icon />
            </span>
            <p className="pt-2 leading-7">{text}</p>
          </div>
        ) : null;
      })}
    </div>
  );
}

function ResponsiveTitleBlock({
  value,
  className
}: {
  value: TextStyle;
  className?: string;
}) {
  const mobileValue = {
    ...value,
    fontSize: Math.min(numberValue(value.fontSize, 32), 36)
  };

  return (
    <>
      <TextBlock value={value} className={["hidden md:block", className].filter(Boolean).join(" ")} as="h2" />
      <TextBlock value={mobileValue} className={[className, "md:hidden"].filter(Boolean).join(" ")} as="h2" />
    </>
  );
}

function TextBlock({
  value,
  className,
  as = "p"
}: {
  value: TextStyle;
  className?: string;
  as?: "p" | "h2";
}) {
  const Comp = as;

  return (
    <Comp
      className={["max-w-full whitespace-normal break-words [overflow-wrap:anywhere]", className].filter(Boolean).join(" ")}
      style={{
        color: colorValue(value.color, "") || undefined,
        fontFamily: fontFamily(value.fontFamily),
        fontSize: value.fontSize,
        overflowWrap: "anywhere",
        wordBreak: "break-all"
      }}
    >
      {value.text}
    </Comp>
  );
}

function ModuleLink({
  href,
  className,
  children
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!href) {
    return <div className={className}>{children}</div>;
  }

  if (/^https?:\/\//i.test(href)) {
    return (
      <a className={className} href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

function textStyle(value: unknown): TextStyle {
  const record = recordValue(value);

  return {
    text: stringValue(record.text),
    fontFamily: stringValue(record.fontFamily) || "system",
    fontSize: numberValue(record.fontSize, 18),
    color: stringValue(record.color)
  };
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function colorValue(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();

  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function gridClass(columns: number) {
  if (columns <= 1) {
    return "grid gap-5";
  }

  if (columns === 2) {
    return "grid gap-5 md:grid-cols-2";
  }

  if (columns === 4) {
    return "grid gap-5 md:grid-cols-2 lg:grid-cols-4";
  }

  if (columns >= 5) {
    return "grid gap-5 md:grid-cols-3 lg:grid-cols-5";
  }

  return "grid gap-5 md:grid-cols-3";
}

function ratioClass(value: string) {
  if (value === "4:3") {
    return "aspect-[4/3]";
  }

  if (value === "1:1") {
    return "aspect-square";
  }

  if (value === "3:4") {
    return "aspect-[3/4]";
  }

  if (value === "9:16") {
    return "aspect-[9/16]";
  }

  return "aspect-video";
}

function fontFamily(value: string | undefined) {
  if (value === "serif") {
    return "serif";
  }

  if (value === "mono") {
    return "monospace";
  }

  return undefined;
}
