import fs from 'node:fs/promises';
import {join} from 'node:path';
import {sourcePages, validateTranslation} from './translate-english-editions.mjs';

const {getPrismaClient} = await import('/app/packages/database/dist/index.js');
const prisma = getPrismaClient();
const workDir = '/app/private-creator-assets/picture-book-translation-en-zh-2026';
if (process.argv.includes('--check')) {
  const files = (await fs.readdir(workDir)).filter(file => /^(?:storyweaver|bookdash)-.*\.json$/.test(file)
    && !file.endsWith('.draft.json') && !file.endsWith('.error.json'));
  const ids = files.map(file => file.slice(0, -5));
  const books = await prisma.pictureBook.findMany({where: {id: {in: ids}}, include: {submission: true}});
  const byId = new Map(books.map(book => [book.id, book]));
  let valid = 0, compact = 0;
  for (const file of files) {
    const stage = JSON.parse(await fs.readFile(join(workDir, file), 'utf8'));
    try {
      validateTranslation(byId.get(stage.id), stage.translation);
      valid++;
      if (stage.compactUsed) compact++;
    } catch (error) {
      console.log(JSON.stringify({id: stage.id, error: error.message}));
    }
  }
  console.log(JSON.stringify({staged: files.length, valid, invalid: files.length - valid, compact}));
  await prisma.$disconnect();
  process.exit(0);
}
const selected = process.argv.find(arg => arg.startsWith('--ids='))?.slice(6).split(',');
const positions = process.argv.find(arg => arg.startsWith('--positions='))?.slice(12).split(',').map(Number);
const books = await prisma.pictureBook.findMany({
  where: {id: {startsWith: 'storyweaver-'}},
  include: {submission: true},
});
for (const book of books) {
  if (selected && !selected.includes(book.id)) continue;
  const pages = sourcePages(book);
  const matching = selected ? pages.filter(page => !positions || positions.includes(page.position))
    : pages.filter(page => /\b(?:lakh|crore)s?\b/i.test(String(page.caption ?? '')));
  if (!matching.length) continue;
  let stage = null, draft = null;
  try { stage = JSON.parse(await fs.readFile(join(workDir, `${book.id}.json`), 'utf8')); } catch {}
  try { draft = JSON.parse(await fs.readFile(join(workDir, `${book.id}.draft.json`), 'utf8')); } catch {}
  for (const page of matching) {
    const translated = stage?.translation?.pages?.find(item => item.position === page.position)
      ?? draft?.pages?.find(item => item.position === page.position);
    console.log(JSON.stringify({id: book.id, title: book.title, position: page.position,
      source: page.caption, target: translated?.caption ?? null}));
  }
}
await prisma.$disconnect();
