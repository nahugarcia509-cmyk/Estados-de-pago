import { readFile, writeFile, mkdir } from 'node:fs/promises';
const domain = (await readFile('shared/domain.ts', 'utf8')).replace(
  /from ['"]decimal\.js['"]/,
  "from 'npm:decimal.js@10.6.0'",
);
const edge = (await readFile('supabase/functions/sheets-ingest/index.ts', 'utf8'))
  .replace(/from ['"]@supabase\/supabase-js['"]/, "from 'npm:@supabase/supabase-js@2.57.4'")
  .replace(/import\s+\{[^}]*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/shared\/domain\.ts['"];?/, '');
const content =
  '// Generated from shared/domain.ts + sheets-ingest/index.ts. No secrets.\n' +
  domain +
  '\n' +
  edge;
const path = 'integrations/supabase-editor/sheets-ingest.ts';
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== content)
    throw new Error('Regenerate Supabase editor function');
} else {
  await mkdir('integrations/supabase-editor', { recursive: true });
  await writeFile(path, content);
}
