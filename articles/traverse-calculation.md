# 导线计算原理与Python实现

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

```
fβ = Σβ测 - (n - 2) × 180°
```

对于附合导线：

```
fβ = Σβ测 - (α终 - α始 + n × 180°)
```

**限差要求**（根据《工程测量规范》）：

```
fβ容 = ±10"√n （四等导线）
fβ容 = ±40"√n （图根导线）
```

### 2.2 坐标方位角推算

```
α前 = α后 + β左 - 180°
α前 = α后 - β右 + 180°
```

### 2.3 坐标增量计算

```
Δx = D × cosα
Δy = D × sinα
```

### 2.4 坐标增量闭合差调整

导线全长闭合差：

```
f = √(fx² + fy²)
```

相对闭合差：

```
K = f / ΣD
```

## 三、Python 实现

```python
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
```

## 四、注意事项

1. **角度单位统一**：观测角度通常为度分秒格式，计算前需转换为十进制度
2. **方位角象限判断**：`atan2` 函数自动处理象限，推荐使用
3. **精度控制**：导线相对闭合差应满足规范要求，超限需重新测量
4. **高程控制**：若同时需要高程，可增加三角高程或水准测量

## 五、扩展阅读

- GB 50026-2020《工程测量标准》
- 闭合导线与附合导线的差异处理
- 导线网平差与间接平差法
