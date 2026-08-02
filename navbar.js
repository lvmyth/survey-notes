// 导航栏统一注入
(function(){
  try {
        // 通过当前页面 URL 确定博客根目录路径
    var loc = window.location.href.replace(/\\\\/g, '/').split('?')[0];
    var base;
    if (loc.indexOf('/articles/') > 0) {
      base = loc.substring(0, loc.indexOf('/articles/')) + '/';
    } else if (loc.indexOf('/tools/') > 0) {
      base = loc.substring(0, loc.indexOf('/tools/')) + '/';
    } else {
      base = loc.substring(0, loc.lastIndexOf('/') + 1);
    }

    var href = window.location.href.replace(/\\\\/g, '/');
    var page = href.split('/').pop().split('?')[0] || 'index.html';
    var inTools = href.indexOf('/tools/') > 0;
    var isHome = (page === 'index.html') && !inTools;
    var isCol = page === 'column.html';
    var isTool = inTools && page !== 'index.html';
    var isAbout = page === 'about.html';

    var styleOn = 'background:rgba(255,255,255,0.12);color:#fff';
    var styleOff = 'color:rgba(255,255,255,0.8)';

    function a(id, active, hrefStr, label) {
      return '<a id="' + id + '" href="' + hrefStr + '" style="' + (active ? styleOn : styleOff) + ';text-decoration:none;padding:8px 16px;border-radius:6px;font-size:0.95rem;cursor:pointer"' + (active ? ' class="active"' : '') + '>' + label + '</a>';
    }

    var homeA = a('navHome', isHome, base + 'index.html', '📋 文章');
    var colA = a('navColumn', isCol, base + 'column.html', '🤖 AI');
    var toolA = a('navTool', isTool, base + 'tools/index.html', '🛠️ 工具');
    var aboutA = a('navAbout', isAbout, base + 'about.html', '👤 关于');

    var html = '<nav class="navbar" style="background:var(--bg-nav);color:var(--text-on-dark);padding:0 2rem;position:fixed;top:0;left:0;right:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.15)">'
      + '<div class="navbar-inner" style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:64px">'
      + '<a class="logo" href="' + base + 'index.html" style="cursor:pointer;font-size:1.4rem;font-weight:700;color:#fff;text-decoration:none;display:flex;align-items:center;gap:8px"><img src="' + base + 'J.png" style="height:32px;vertical-align:middle;margin-right:6px">测量工程笔记</a>'
      + '<ul class="nav-links" style="display:flex;gap:4px;list-style:none">'
      + '<li>' + homeA + '</li>'
      + '<li>' + colA + '</li>'
      + '<li>' + toolA + '</li>'
      + '<li>' + aboutA + '</li>'
      + '</ul></div></nav>';

    var el = document.querySelector('.navbar');
    if (el) { el.outerHTML = html; }
    else if (document.body) { document.body.insertAdjacentHTML('afterbegin', html); }

        // 注入响应式导航栏样式
    var rs = document.createElement('style');
    rs.textContent = '@media(max-width:600px){.navbar{padding:0 0.6rem!important}.navbar-inner{height:50px!important;gap:2px}.navbar .logo{font-size:0.85rem!important}.navbar .logo img{height:20px!important;margin-right:3px!important}.nav-links{gap:0!important}.nav-links a{padding:5px 3px!important;font-size:0.72rem!important}}@media(max-width:420px){.navbar .logo{font-size:0.7rem!important}.navbar .logo img{height:18px!important}.nav-links a{padding:4px 2px!important;font-size:0.65rem!important}}';
    document.head.appendChild(rs);

    // 工具页在导航栏下方添加返回链接（工具首页除外）
    if (inTools && page !== 'index.html') {
      var newNav = document.querySelector('.navbar');
      if (newNav) {
        var backBar = '<div id="backBar" class="no-print" style="position:relative;z-index:2;padding:0;background:var(--bg)">'
          + '<div style="max-width:1200px;margin:0 auto;padding:8px 1rem 12px">'
          + '<a href="' + base + 'tools/index.html" style="color:var(--primary);text-decoration:none;font-size:0.9rem;font-weight:500">&larr; 返回工具箱</a>'
          + '</div></div>';
        newNav.insertAdjacentHTML('afterend', backBar);
      }
    }
  } catch (e) {
    console.error && console.error('navbar.js error:', e);
  }
})();
