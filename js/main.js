/**
 * 测量工程笔记 - 主逻辑（内嵌版）
 * 文章数据已内嵌，无需网络请求，双击 HTML 即可运行
 */

// ===== 文章数据（内嵌） =====

const BLOG_DATA = {
  articles: [
    {
      id: "traverse-calculation",
      title: "导线计算原理与Python实现",
      date: "2026-05-18",
      tags: ["导线计算", "坐标计算", "Python"],
      excerpt: "详细介绍导线测量的基本原理、内业计算方法，以及如何用 Python 快速完成导线平差计算。",
      content: `# 导线计算原理与Python实现

> 导线测量是平面控制测量中最常用的方法之一，本文详细讲解导线计算的全过程，并提供 Python 实现代码。

## 一、导线测量概述

导线测量（Traverse Surveying）是通过测量一系列连续的折线边长和转折角，逐步推算各导线点坐标的方法。它广泛应用于：

- 带状工程测量（道路、管线）
- 城市控制测量
- 地形图测绘控制网

### 导线布设形式

| 类型 | 特点 | 适用场景 |
|------|------|----------|
| **闭合导线** | 起点与终点为同一点 | 矿区、建筑物场地 |
| **附合导线** | 起闭于两个已知点 | 道路、管线测量 |
| **支导线** | 从已知点出发不闭合 | 图根控制点加密 |

## 二、导线计算步骤

### 2.1 角度闭合差计算

对于闭合导线：

\`\`\`
fβ = Σβ测 - (n - 2) × 180°
\`\`\`

对于附合导线：

\`\`\`
fβ = Σβ测 - (α终 - α始 + n × 180°)
\`\`\`

**限差要求**（根据《工程测量规范》）：

\`\`\`
fβ容 = ±10"√n （四等导线）
fβ容 = ±40"√n （图根导线）
\`\`\`

### 2.2 坐标方位角推算

\`\`\`
α前 = α后 + β左 - 180°
α前 = α后 - β右 + 180°
\`\`\`

### 2.3 坐标增量计算

\`\`\`
Δx = D × cosα
Δy = D × sinα
\`\`\`

### 2.4 坐标增量闭合差调整

导线全长闭合差：

\`\`\`
f = √(fx² + fy²)
\`\`\`

相对闭合差：

\`\`\`
K = f / ΣD
\`\`\`

## 三、Python 实现

\`\`\`python
import math

def traverse_calculation(points, angles, distances):
    """
    导线计算主函数
    
    参数:
        points: 已知点列表 [(x1,y1), (x2,y2), ...]
        angles: 观测角列表 (度)
        distances: 边长列表 (m)
    
    返回:
        计算出的各点坐标
    """
    n = len(points)
    coordinates = [points[0]]
    
    # 计算角度闭合差
    sum_angles = sum(angles)
    f_beta = sum_angles - (n - 2) * 180
    
    # 角度平差
    corrected_angles = [a - f_beta / n for a in angles]
    
    # 推算坐标方位角
    azimuths = []
    for i in range(n - 1):
        dx = points[i+1][0] - points[i][0]
        dy = points[i+1][1] - points[i][1]
        azimuth = math.degrees(math.atan2(dy, dx))
        azimuths.append(azimuth if azimuth >= 0 else azimuth + 360)
    
    # 推算各边方位角
    for i in range(n - 1):
        next_az = azimuths[i] + corrected_angles[i] - 180
        if i > 0:
            next_az = azimuths[-1] + corrected_angles[i] - 180
        if next_az < 0:
            next_az += 360
        elif next_az >= 360:
            next_az -= 360
        azimuths.append(next_az)
    
    # 计算坐标增量
    dx_sum, dy_sum = 0, 0
    for i in range(n - 1):
        dx = distances[i] * math.cos(math.radians(azimuths[i+1]))
        dy = distances[i] * math.sin(math.radians(azimuths[i+1]))
        dx_sum += dx
        dy_sum += dy
    
    # 分配闭合差
    total_dist = sum(distances)
    for i in range(n - 1):
        vx = -dx_sum / total_dist * distances[i]
        vy = -dy_sum / total_dist * distances[i]
        x = coordinates[-1][0] + distances[i] * math.cos(math.radians(azimuths[i+1])) + vx
        y = coordinates[-1][1] + distances[i] * math.sin(math.radians(azimuths[i+1])) + vy
        coordinates.append((round(x, 3), round(y, 3)))
    
    return coordinates


if __name__ == "__main__":
    # 示例数据
    pts = [(500.000, 500.000), (612.347, 458.231)]
    angs = [89.3520, 90.3015, 89.5905, 90.3110]
    dists = [82.468, 76.351, 94.582, 88.234]
    
    result = traverse_calculation(pts, angs, dists)
    for i, (x, y) in enumerate(result):
        print(f"P{i+1}: X={x:.3f}, Y={y:.3f}")
\`\`\`

## 四、注意事项

1. **角度单位统一**：观测角度通常为度分秒格式，计算前需转换为十进制度
2. **方位角象限判断**：\`atan2\` 函数自动处理象限，推荐使用
3. **精度控制**：导线相对闭合差应满足规范要求，超限需重新测量
4. **高程控制**：若同时需要高程，可增加三角高程或水准测量

## 五、扩展阅读

- GB 50026-2020《工程测量标准》
- 闭合导线与附合导线的差异处理
- 导线网平差与间接平差法`
    },
    {
      id: "coordinate-transformation",
      title: "坐标正反算：从公式到代码",
      date: "2026-05-15",
      tags: ["坐标计算", "Python", "全站仪"],
      excerpt: "坐标正算和坐标反算是测量中最基础的计算，本文从数学公式出发，一步步推导并给出 Python 实现。",
      content: `# 坐标正反算：从公式到代码

> 坐标正算（由边长和方位角求坐标增量）和坐标反算（由两点坐标求方位角和距离）是测量中最基础、最常用的计算，掌握它们是所有测量工作的前提。

## 一、坐标正算

### 原理

已知 A 点坐标 (XA, YA)、AB 边长 D 和坐标方位角 α，求 B 点坐标：

\`\`\`
XB = XA + D × cosα
YB = YA + D × sinα
\`\`\`

### Python 实现

\`\`\`python
import math

def direct_computation(xa, ya, distance, azimuth):
    """
    坐标正算：已知一点坐标、边长和方位角，计算另一点坐标
    
    参数:
        xa, ya: 已知点坐标 (m)
        distance: 水平距离 (m)
        azimuth: 坐标方位角 (度)
    
    返回:
        (xb, yb): 待求点坐标
    """
    rad = math.radians(azimuth)
    xb = xa + distance * math.cos(rad)
    yb = ya + distance * math.sin(rad)
    return (round(xb, 3), round(yb, 3))


# 示例
result = direct_computation(500.000, 500.000, 82.468, 125.3025)
print(f"B点坐标: X={result[0]}, Y={result[1]}")
\`\`\`

## 二、坐标反算

### 原理

已知 A、B 两点坐标，求 AB 边长 D 和坐标方位角 α：

\`\`\`
D = √[(XB - XA)² + (YB - YA)²]
α = arctan(ΔY / ΔX)  需根据象限判断
\`\`\`

### 象限判断规则

| ΔX | ΔY | 象限 | 方位角 |
|----|----|------|--------|
| +  | +  | 一   | α = θ |
| -  | +  | 二   | α = 180° - θ (或 θ + 180°) |
| -  | -  | 三   | α = 180° + θ |
| +  | -  | 四   | α = 360° - θ |

> 注：θ = |arctan(|ΔY/ΔX|)|，即绝对值角度

### Python 实现

\`\`\`python
def inverse_computation(xa, ya, xb, yb):
    """
    坐标反算：已知两点坐标，计算边长和方位角
    
    参数:
        xa, ya: A点坐标 (m)
        xb, yb: B点坐标 (m)
    
    返回:
        (distance, azimuth): 水平距离和坐标方位角(度)
    """
    dx = xb - xa
    dy = yb - ya
    distance = math.sqrt(dx**2 + dy**2)
    
    azimuth = math.degrees(math.atan2(dy, dx))
    if azimuth < 0:
        azimuth += 360
    
    return (round(distance, 3), round(azimuth, 6))


# 示例
dist, az = inverse_computation(500.000, 500.000, 452.168, 567.342)
print(f"距离: {dist}m, 方位角: {az}°")
\`\`\`

## 三、完整工具函数

将正反算整合为一个工具类，方便日常调用：

\`\`\`python
class CoordinateTool:
    """坐标计算工具类"""
    
    @staticmethod
    def dms_to_dd(degrees, minutes, seconds):
        """度分秒转十进制度"""
        return degrees + minutes / 60 + seconds / 3600
    
    @staticmethod
    def dd_to_dms(dd):
        """十进制度转度分秒"""
        d = int(dd)
        m = int((dd - d) * 60)
        s = (dd - d - m / 60) * 3600
        return (d, m, round(s, 1))
    
    @staticmethod
    def direct(xa, ya, dist, azimuth):
        """坐标正算"""
        rad = math.radians(azimuth)
        return (round(xa + dist * math.cos(rad), 3),
                round(ya + dist * math.sin(rad), 3))
    
    @staticmethod
    def inverse(xa, ya, xb, yb):
        """坐标反算"""
        dx, dy = xb - xa, yb - ya
        d = math.sqrt(dx**2 + dy**2)
        a = math.degrees(math.atan2(dy, dx))
        if a < 0: a += 360
        return (round(d, 3), round(a, 6))


tool = CoordinateTool()
print(tool.direct(500, 500, 82.468, 125.3025))
\`\`\`

## 四、应用场景

### 4.1 放样计算

在施工放样中，设计坐标→现场测设：

1. 根据设计图纸读取待放样点坐标
2. 反算测站到放样点的方位角和距离
3. 全站仪定向后转动相应角度、测设距离

### 4.2 导线推算

导线测量中，每站都进行正算：

\`\`\`
P1 → P2: 正算(已知P1坐标、P1P2边长、方位角) → P2坐标
P2 → P3: 正算(已知P2坐标、P2P3边长、方位角) → P3坐标
\`\`\`

## 五、常见错误

- ❌ 使用 Excel 时反三角函数的弧度/度混淆
- ❌ 方位角未处理负值（结果应为 0°~360°）
- ❌ 误将磁方位角当坐标方位角使用
- ✅ 推荐：统一使用 \`atan2(dy, dx)\` 自动处理象限`
    },
    {
      id: "total-station-guide",
      title: "全站仪操作入门：建站与测量",
      date: "2026-05-12",
      tags: ["全站仪", "测量实操"],
      excerpt: "全站仪是现代测量的核心设备，本文从建站、定向到数据采集，梳理一套完整的操作流程与注意事项。",
      content: `# 全站仪操作入门：建站与测量

> 全站仪（Total Station）集电子测角、测距和数据记录于一体，是当今测量工作的核心设备。本文面向初学者，梳理从建站到数据导出的完整流程。

## 一、仪器组成与基本原理

### 核心部件

| 部件 | 功能 |
|------|------|
| 望远镜 | 瞄准目标，十字丝精确对准 |
| 电子经纬仪 | 测量水平角、竖直角 |
| 测距仪 | 通过红外/激光测定斜距 |
| 显示屏/键盘 | 操作界面，输入参数 |
| 基座/三脚架 | 稳定支撑与整平 |

### 基本原理

全站仪通过**测角**（水平角、竖直角）和**测距**（斜距），结合已知点坐标和仪器高、棱镜高，计算出目标点的三维坐标：

\`\`\`
X = X站 + S × sinV × cosα
Y = Y站 + S × sinV × sinα
Z = Z站 + S × cosV + i - v
\`\`\`

其中：S=斜距，V=竖直角，α=方位角，i=仪器高，v=棱镜高

## 二、建站流程

### 2.1 对中整平

1. **架设三脚架**：高度适中（与操作者下巴齐平），架头大致水平
2. **对中**：通过光学/激光对中器使仪器中心对准测站点位
3. **粗平**：调整三脚架腿长度，使圆水准器气泡居中
4. **精平**：旋转脚螺旋，使管水准器气泡在各个方向居中
5. **复查对中**：对中偏移超限时，松基座螺丝平移微调

### 2.2 已知点建站

\`\`\`
步骤:
1. 开机 → 进入"建站"程序
2. 输入测站点号及坐标
3. 输入仪器高
4. 选择"角度定向"或"坐标定向"
5. 瞄准后视点 → 输入后视点坐标 → 测量
6. 检查后视点坐标偏差（一般要求 < 5mm）
7. 确认建站完成
\`\`\`

### 2.3 后方交会建站

适用于已知点不便架站的情况（如基坑边缘）：

\`\`\`
需要: 2~3个已知控制点
流程:
1. 输入各已知点坐标
2. 依次瞄准各已知点 → 测量
3. 仪器自动计算测站坐标
4. 检查残差（一般要求 < 1cm）
\`\`\`

## 三、数据采集

### 3.1 测量模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 单次测量 | 测量一次 | 一般放样/检查 |
| 连续测量 | 持续测量更新 | 跟踪目标 |
| 均值测量 | 多次测量取平均 | 高精度要求 |
| 免棱镜 | 直接测至目标面 | 无法到达的点 |

### 3.2 采集要点

- **立镜技巧**：棱镜对准仪器，圆水准器居中
- **记录要素**：点号、编码（描述）、坐标
- **检核频率**：每测站采集 20~30 个点后检查后视
- **天气影响**：雾天/强阳光下精度下降，适当增加测量次数

## 四、数据导出

### 常用方式

1. **U盘直拷**：现代全站仪支持 USB 导出 \`.txt\` 或 \`.csv\`
2. **蓝牙传输**：通过手机 App 接收
3. **连线传输**：串口/USB 连接电脑，使用配套软件
4. **手动记录**：传统方法，手簿记录后录入电脑

### 数据格式示例（CSV）

\`\`\`
点号,编码,X,Y,Z
P01,ZD1,500.000,500.000,10.000
P02,ZD2,512.348,482.156,10.523
P03,墙角,508.216,490.774,10.245
\`\`\`

## 五、常见问题与解决

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| 对中偏位 | 精平后未复查 | 精平后必须检查对中 |
| 坐标偏差大 | 后视点错误/瞄准偏差 | 重新输入后视坐标，精确瞄准 |
| 测距失败 | 遮挡/棱镜角度不对 | 清理视线，调整棱镜方向 |
| 无法建站 | 已知点坐标错误 | 检查已知点坐标来源 |

## 六、日常维护

- **存放**：干燥箱内保存，湿度 < 60%
- **清洁**：镜头用专用擦镜纸，外壳用软布
- **电池**：长期不用时取出电池，每月充放一次
- **校准**：每年送检一次，或撞击后重新校准
- **运输**：使用专用仪器箱，泡沫填充到位

---

> **一句话总结**：对中整平要到位，后视检核不能少，数据记录要规范，仪器保养要上心。`
    }
  ]
};


// ===== 工具函数 =====

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}


// ===== 首页：文章列表 =====

function loadArticleList() {
  const grid = document.getElementById('articleGrid');
  const filterContainer = document.getElementById('tagFilter');
  if (!grid) return;

  const articles = BLOG_DATA.articles;

  // 统计标签
  const tagCounts = {};
  articles.forEach(a => {
    a.tags.forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  // 渲染标签按钮
  const tags = Object.keys(tagCounts).sort();
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.dataset.tag = tag;
    btn.innerHTML = tag + ' <span class="count">' + tagCounts[tag] + '</span>';
    btn.addEventListener('click', function () { filterArticles(tag, articles); });
    filterContainer.appendChild(btn);
  });

  // "全部"按钮
  const allBtn = filterContainer.querySelector('[data-tag="all"]');
  if (allBtn) {
    allBtn.addEventListener('click', function () {
      filterContainer.querySelectorAll('.tag-btn').forEach(function (b) { b.classList.remove('active'); });
      allBtn.classList.add('active');
      renderArticles(articles);
    });
    allBtn.classList.add('active');
  }

  renderArticles(articles);
}


function filterArticles(tag, articles) {
  document.querySelectorAll('.tag-btn').forEach(function (b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('.tag-btn[data-tag="' + tag + '"]');
  if (activeBtn) activeBtn.classList.add('active');

  var filtered = tag === 'all' ? articles : articles.filter(function (a) { return a.tags.indexOf(tag) !== -1; });
  renderArticles(filtered);
}


function renderArticles(articles) {
  var grid = document.getElementById('articleGrid');
  if (!grid) return;

  if (articles.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>没有找到相关文章</h3><p>换个标签试试吧</p></div>';
    return;
  }

  grid.innerHTML = articles.map(function (a) {
    return '<div class="article-card" onclick="window.location.href=\'article.html?id=' + a.id + '\'">' +
      '<div class="card-tags">' +
      a.tags.map(function (t) { return '<span class="card-tag">' + t + '</span>'; }).join('') +
      '</div>' +
      '<h2>' + a.title + '</h2>' +
      '<p class="card-excerpt">' + a.excerpt + '</p>' +
      '<div class="card-meta">' +
      '<span class="date">' + a.date + '</span>' +
      '<span class="read-more">阅读全文 →</span>' +
      '</div>' +
      '</div>';
  }).join('');
}


// ===== 文章详情页 =====

function loadArticleDetail() {
  var container = document.getElementById('articleDetail');
  if (!container) return;

  var articleId = getQueryParam('id');
  if (!articleId) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">❓</div><h3>缺少文章 ID</h3><p><a href="index.html">返回文章列表</a></p></div>';
    return;
  }

  var meta = null;
  for (var i = 0; i < BLOG_DATA.articles.length; i++) {
    if (BLOG_DATA.articles[i].id === articleId) {
      meta = BLOG_DATA.articles[i];
      break;
    }
  }

  if (!meta) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>文章未找到</h3><p><a href="index.html">返回文章列表</a></p></div>';
    return;
  }

  // 渲染 Markdown
  var htmlContent = marked.parse(meta.content);

  container.innerHTML =
    '<div class="article-detail">' +
    '<div class="article-header">' +
    '<a href="index.html" class="back-link">← 返回文章列表</a>' +
    '<h1>' + meta.title + '</h1>' +
    '<div class="article-meta"><span class="meta-date">' + meta.date + '</span></div>' +
    '<div class="article-tags">' +
    meta.tags.map(function (t) { return '<span class="tag-item">' + t + '</span>'; }).join('') +
    '</div>' +
    '</div>' +
    '<div class="article-content">' + htmlContent + '</div>' +
    '</div>';
}


// ===== 导航栏移动端菜单 =====

function setupMobileMenu() {
  var toggle = document.getElementById('menuToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
  }
}


// ===== 初始化 =====

document.addEventListener('DOMContentLoaded', function () {
  setupMobileMenu();
  loadArticleList();
  loadArticleDetail();
});
