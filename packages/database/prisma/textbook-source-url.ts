const smartEduOrigin = "https://basic.smartedu.cn";

export function smartEduTextbookSourceUrl(contentId: string): string {
  const normalizedContentId = contentId.trim();

  if (!normalizedContentId) {
    throw new Error("SmartEdu 教材 contentId 不能为空");
  }

  const url = new URL("/tchMaterial/detail", smartEduOrigin);
  url.searchParams.set("contentType", "assets_document");
  url.searchParams.set("contentId", normalizedContentId);
  url.searchParams.set("catalogType", "tchMaterial");
  url.searchParams.set("subCatalog", "tchMaterial");

  return url.toString();
}
