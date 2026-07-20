/**
 * build-all.js — 从独立 content-xxx.js 文件重建 article-contents.js
 * 
 * 用法：node articles/build-all.js
 * 
 * 修改或新增文章后运行此命令，更新合集文件。
 */
const fs = require('fs');
const path = require('path');

const articlesDir = __dirname;  // articles/
const files = fs.readdirSync(articlesDir)
  .filter(f => f.startsWith('content-') && f.endsWith('.js') && f !== 'content-.js')
  .sort();

let lines = [];
lines.push('// ===== 文章内容（由 build-all.js 自动生成） =====');
lines.push('// 编辑独立文件 articles/content-xxx.js 后运行此命令重建');
lines.push('// 如需新增文章：先创建 articles/content-xxx.js，');
lines.push('// 再在 index.html 的 ARTICLES 数组中添加元数据');
lines.push('var ARTICLE_CONTENTS = {};');
lines.push('');

for (const file of files) {
  const content = fs.readFileSync(path.join(articlesDir, file), 'utf-8');
  lines.push('// --- ' + file);
  // Extract the assignment line
  const match = content.match(/ARTICLE_CONTENTS\["[^"]+"\]\s*=\s*"[^"]*";/);
  if (match) {
    lines.push(match[0]);
  } else {
    lines.push(content.trim());
  }
  lines.push('');
}

fs.writeFileSync(path.join(articlesDir, 'article-contents.js'), lines.join('\n'), 'utf-8');
console.log('✓ 已重建 article-contents.js (' + files.length + ' 篇文章)');
console.log('');
console.log('工作流程：');
console.log('  编辑文章 → 修改 articles/content-xxx.js');
console.log('  新增文章 → 创建 articles/content-xxx.js + 修改 index.html 元数据');
console.log('  然后运行: node articles/build-all.js');
