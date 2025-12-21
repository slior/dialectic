import fs from 'fs';
import path from 'path';

export function getDebatesDir(): string {
  const dir = path.resolve(process.cwd(), 'debates');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
