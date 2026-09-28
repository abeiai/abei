const smartEduHost = "basic.smartedu.cn";
const smartEduPath = "/tchMaterial/detail";
const smartEduContentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function getSmartEduTextbookSourceUrl(
  value: string | null | undefined
): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    const contentId = url.searchParams.get("contentId");
    const parameterNames = [...url.searchParams.keys()].sort();

    if (
      url.protocol !== "https:" ||
      url.host !== smartEduHost ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== smartEduPath ||
      !contentId ||
      !smartEduContentIdPattern.test(contentId) ||
      url.searchParams.get("contentType") !== "assets_document" ||
      url.searchParams.get("catalogType") !== "tchMaterial" ||
      url.searchParams.get("subCatalog") !== "tchMaterial" ||
      parameterNames.join(",") !== "catalogType,contentId,contentType,subCatalog"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function textbookSourceSameAs(
  value: string | null | undefined
): { sameAs?: string } {
  const sourceUrl = getSmartEduTextbookSourceUrl(value);

  return sourceUrl ? { sameAs: sourceUrl } : {};
}
