import type { Prisma, PrismaClient } from "../generated/client/index.js";

type PrismaClientLike = PrismaClient;

export interface AiToolTemplateCategoryPlugin {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
}

export interface AiToolTemplatePlugin {
  toolKey?: string;
  name: string;
  slug?: string;
  categorySlug?: string;
  category?: AiToolTemplateCategoryPlugin;
  description?: string | null;
  inputSchema: {
    fields: Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
      placeholder?: string;
      options?: string[];
      min?: number;
      max?: number;
      default?: string | number | boolean;
      accept?: string[];
      maxSizeMb?: number;
    }>;
  };
  promptTemplate: string;
  modelAlias?: string;
  defaultModelAlias?: string;
  fallbackModelAlias?: string | null;
  requiredCapabilities?: string[];
  costRule?: {
    type: "fixed";
    credits: number;
  };
  costCredits?: number;
  isEnabled?: boolean;
  sortOrder?: number;
  templateVersion?: string | null;
}

export interface RegisterAiToolTemplatesInput {
  categories?: readonly AiToolTemplateCategoryPlugin[];
  templates: readonly AiToolTemplatePlugin[];
  overwrite?: boolean;
  builtIn?: boolean;
  templateVersion?: string | null;
}

export async function registerAiToolTemplates(
  prisma: PrismaClientLike,
  input: RegisterAiToolTemplatesInput
) {
  const overwrite = input.overwrite === true;
  const categories = new Map<string, AiToolTemplateCategoryPlugin>();

  for (const category of input.categories ?? []) {
    assertSafeToolPayload(category);
    assertValidTemplateSlug(category.slug, "工具分类 slug");
    categories.set(category.slug, category);
  }

  for (const template of input.templates) {
    assertSafeToolPayload(template);
    const slug = templateSlug(template);
    assertValidTemplateSlug(slug, "工具 slug");

    const category = normalizeTemplateCategory(template, categories);
    categories.set(category.slug, category);
  }

  const categoryIds = new Map<string, string>();

  for (const category of categories.values()) {
    const existing = await prisma.aiToolCategory.findUnique({
      where: {
        slug: category.slug
      }
    });
    const saved = existing
      ? overwrite
        ? await prisma.aiToolCategory.update({
            where: {
              slug: category.slug
            },
            data: {
              name: category.name,
              description: category.description ?? null,
              sortOrder: category.sortOrder ?? 0,
              isVisible: category.isVisible ?? true
            }
          })
        : existing
      : await prisma.aiToolCategory.create({
          data: {
            name: category.name,
            slug: category.slug,
            description: category.description ?? null,
            sortOrder: category.sortOrder ?? 0,
            isVisible: category.isVisible ?? true
          }
        });

    categoryIds.set(saved.slug, saved.id);
  }

  let createdCount = 0;
  let preservedCount = 0;
  let updatedCount = 0;

  for (const template of input.templates) {
    const category = normalizeTemplateCategory(template, categories);
    const categoryId = categoryIds.get(category.slug);

    if (!categoryId) {
      throw new Error(`工具模板分类不存在：${category.slug}`);
    }

    const existing = await prisma.aiScenario.findUnique({
      where: {
        slug: templateSlug(template)
      },
      include: {
        modelBinding: true
      }
    });
    const normalized = normalizeTemplate(template, categoryId, input);

    if (existing && !overwrite) {
      if (!existing.modelBinding) {
        await prisma.aiScenarioModelBinding.create({
          data: {
            scenarioId: existing.id,
            defaultModelAlias: normalized.defaultModelAlias,
            fallbackModelAlias: normalized.fallbackModelAlias
          }
        });
      }

      preservedCount += 1;
      continue;
    }

    if (existing) {
      await prisma.aiScenario.update({
        where: {
          id: existing.id
        },
        data: {
          name: normalized.name,
          description: normalized.description,
          toolCategoryId: normalized.categoryId,
          promptTemplate: normalized.promptTemplate,
          promptVariables: promptVariablesFromSchema(normalized.inputSchema) as Prisma.InputJsonValue,
          inputSchema: normalized.inputSchema as Prisma.InputJsonValue,
          requiredCapabilities: normalized.requiredCapabilities as Prisma.InputJsonValue,
          costCredits: normalized.costCredits,
          isEnabled: normalized.isEnabled,
          sortOrder: normalized.sortOrder,
          isBuiltIn: normalized.isBuiltIn,
          templateVersion: normalized.templateVersion
        }
      });
      await prisma.aiScenarioModelBinding.upsert({
        where: {
          scenarioId: existing.id
        },
        update: {
          defaultModelAlias: normalized.defaultModelAlias,
          fallbackModelAlias: normalized.fallbackModelAlias
        },
        create: {
          scenarioId: existing.id,
          defaultModelAlias: normalized.defaultModelAlias,
          fallbackModelAlias: normalized.fallbackModelAlias
        }
      });
      updatedCount += 1;
      continue;
    }

    await prisma.aiScenario.create({
      data: {
        name: normalized.name,
        slug: normalized.slug,
        description: normalized.description,
        toolCategoryId: normalized.categoryId,
        promptTemplate: normalized.promptTemplate,
        promptVariables: promptVariablesFromSchema(normalized.inputSchema) as Prisma.InputJsonValue,
        inputSchema: normalized.inputSchema as Prisma.InputJsonValue,
        requiredCapabilities: normalized.requiredCapabilities as Prisma.InputJsonValue,
        costCredits: normalized.costCredits,
        isEnabled: normalized.isEnabled,
        sortOrder: normalized.sortOrder,
        isBuiltIn: normalized.isBuiltIn,
        templateVersion: normalized.templateVersion,
        modelBinding: {
          create: {
            defaultModelAlias: normalized.defaultModelAlias,
            fallbackModelAlias: normalized.fallbackModelAlias
          }
        }
      }
    });
    createdCount += 1;
  }

  return {
    categoryCount: categories.size,
    templateCount: input.templates.length,
    createdCount,
    preservedCount,
    updatedCount
  };
}

function normalizeTemplateCategory(
  template: AiToolTemplatePlugin,
  categories: Map<string, AiToolTemplateCategoryPlugin>
) {
  if (template.category) {
    assertValidTemplateSlug(template.category.slug, "工具分类 slug");

    return template.category;
  }

  const categorySlug = template.categorySlug?.trim();

  if (!categorySlug) {
    throw new Error(`工具模板 ${templateSlug(template)} 缺少分类配置。`);
  }

  const category = categories.get(categorySlug);

  if (!category) {
    throw new Error(`工具模板 ${templateSlug(template)} 引用了不存在的分类：${categorySlug}`);
  }

  return category;
}

function normalizeTemplate(
  template: AiToolTemplatePlugin,
  categoryId: string,
  input: RegisterAiToolTemplatesInput
) {
  const costCredits =
    typeof template.costRule?.credits === "number" ? template.costRule.credits : template.costCredits;

  return {
    name: template.name.trim(),
    slug: templateSlug(template),
    description: template.description ?? null,
    categoryId,
    promptTemplate: template.promptTemplate.trim(),
    inputSchema: template.inputSchema,
    requiredCapabilities: template.requiredCapabilities ?? ["TEXT"],
    costCredits: positiveInteger(costCredits, 1, 100000, 100),
    isEnabled: template.isEnabled !== false,
    sortOrder: positiveInteger(template.sortOrder, 0, 100000, 0),
    isBuiltIn: input.builtIn === true,
    templateVersion: template.templateVersion ?? input.templateVersion ?? null,
    defaultModelAlias: (template.defaultModelAlias ?? template.modelAlias ?? "default-chat").trim() || "default-chat",
    fallbackModelAlias: template.fallbackModelAlias?.trim() || null
  };
}

function promptVariablesFromSchema(schema: AiToolTemplatePlugin["inputSchema"]) {
  return schema.fields
    .filter((field) => field.name !== "input" && !["voice-select", "audio-upload", "audio-preview"].includes(field.type))
    .map((field) => ({
      name: field.name,
      label: field.label,
      required: field.required === true,
      placeholder: field.placeholder ?? ""
    }));
}

function templateSlug(template: AiToolTemplatePlugin) {
  const slug = (template.slug ?? template.toolKey ?? "").trim();

  if (!slug) {
    throw new Error(`工具模板 ${template.name} 缺少 slug。`);
  }

  return slug;
}

export function assertSafeToolPayload(value: unknown) {
  const forbidden = findForbiddenSecretKey(value);

  if (forbidden) {
    throw new Error(`工具模板不得包含密钥字段：${forbidden}`);
  }
}

function findForbiddenSecretKey(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenSecretKey(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey.includes("apikey") ||
      normalizedKey.includes("api_key") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("token")
    ) {
      return key;
    }

    const found = findForbiddenSecretKey(child);

    if (found) {
      return found;
    }
  }

  return null;
}

function assertValidTemplateSlug(value: string, label: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} 只能包含小写字母、数字和短横线。`);
  }
}

function positiveInteger(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}
