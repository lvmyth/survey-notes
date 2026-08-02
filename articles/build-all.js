/**
 * build-all.js — 从独立 content-xxx.js 文件重建 article-contents.js 和 feed.xml
 * 
 * 用法：node articles/build-all.js
 * 
 * 修改或新增文章后运行此命令，更新合集文件和 RSS 订阅。
 * 新增文章步骤：
 *   1. 创建 articles/content-xxx.js
 *   2. 在 index.html 的 ARTICLES 数组中添加元数据
 *   3. 运行此命令
 */
const fs = require('fs');
const path = require('path');

const projectDir = path.join(__dirname, '..');
const articlesDir = __dirname;

// ===== 1. 重建 article-contents.js =====
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

// ===== 2. 从 articles-meta.js 读取文章元数据 =====
const metaPath = path.join(articlesDir, 'articles-meta.js');
const metaContent = fs.readFileSync(metaPath, 'utf-8');
const articlesMatch = metaContent.match(/var ARTICLES = (\[[\s\S]*?\]);/);
if (!articlesMatch) {
  console.error('✗ 无法从 articles-meta.js 解析 ARTICLES 数组');
  process.exit(1);
}

let articles;
try {
  articles = eval('(' + articlesMatch[1] + ')');
} catch (e) {
  console.error('✗ 解析 ARTICLES 数组失败:', e.message);
  process.exit(1);
}

// 按日期降序排序
articles.sort(function(a, b) { return b.date.localeCompare(a.date); });

// ===== 3. 生成 RSS feed.xml =====
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

var rssLines = [];
rssLines.push('<?xml version="1.0" encoding="UTF-8"?>');
rssLines.push('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
rssLines.push('<channel>');
rssLines.push('  <title>测量工程笔记</title>');
rssLines.push('  <link>https://www.axureshow.com/project/snUNZfl9/</link>');
rssLines.push('  <description>一个测量员用全站仪丈量世界、用代码解决问题的技术笔记</description>');
rssLines.push('  <language>zh-CN</language>');
rssLines.push('  <atom:link href="feed.xml" rel="self" type="application/rss+xml"/>');
rssLines.push('  <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>');
rssLines.push('');

// 将 YYYY-MM-DD 转为 RSS 规范的 RFC 822 格式（部分阅读器对裸日期不兼容）
function toRfc822Date(s) {
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(s);
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // 用 UTC 构造仅用于算星期几，避免部署环境时区干扰
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  var d = new Date(t);
  return days[d.getUTCDay()] + ', ' + m[3] + ' ' + mons[+m[2] - 1] + ' ' + m[1] + ' 00:00:00 +0800';
}

for (var i = 0; i < articles.length; i++) {
  var a = articles[i];
  rssLines.push('  <item>');
  rssLines.push('    <title>' + escapeXml(a.title) + '</title>');
  rssLines.push('    <link>https://www.axureshow.com/project/snUNZfl9/?id=' + a.id + '</link>');
  rssLines.push('    <guid>https://www.axureshow.com/project/snUNZfl9/?id=' + a.id + '</guid>');
  rssLines.push('    <pubDate>' + toRfc822Date(a.date) + '</pubDate>');
  rssLines.push('    <description>' + escapeXml(a.excerpt) + '</description>');
  for (var j = 0; j < a.tags.length; j++) {
    rssLines.push('    <category>' + escapeXml(a.tags[j]) + '</category>');
  }
  rssLines.push('  </item>');
  rssLines.push('');
}

rssLines.push('</channel>');
rssLines.push('</rss>');

fs.writeFileSync(path.join(projectDir, 'feed.xml'), rssLines.join('\n'), 'utf-8');
console.log('✓ 已重建 feed.xml (' + articles.length + ' 篇文章)');

console.log('');
console.log('工作流程：');
console.log('  编辑文章 → 修改 articles/content-xxx.js');
console.log('  新增文章 → 创建 articles/content-xxx.js + 修改 articles/articles-meta.js');
console.log('  然后运行: node articles/build-all.js');
