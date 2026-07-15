# 坐标正反算：从公式到代码

> 坐标正算（由边长和方位角求坐标增量）和坐标反算（由两点坐标求方位角和距离）是测量中最基础、最常用的计算，掌握它们是所有测量工作的前提。

## 一、坐标正算

### 原理

已知 A 点坐标 (XA, YA)、AB 边长 D 和坐标方位角 α，求 B 点坐标：

```
XB = XA + D × cosα
YB = YA + D × sinα
```

### Python 实现

```python
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
```

## 二、坐标反算

### 原理

已知 A、B 两点坐标，求 AB 边长 D 和坐标方位角 α：

```
D = √[(XB - XA)² + (YB - YA)²]
α = arctan(ΔY / ΔX)  需根据象限判断
```

### 象限判断规则

| ΔX | ΔY | 象限 | 方位角 |
|----|----|------|--------|
| +  | +  | 一   | α = θ |
| -  | +  | 二   | α = 180° - θ (或 θ + 180°) |
| -  | -  | 三   | α = 180° + θ |
| +  | -  | 四   | α = 360° - θ |

> 注：θ = |arctan(|ΔY/ΔX|)|，即绝对值角度

### Python 实现

```python
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
```

## 三、完整工具函数

将正反算整合为一个工具类，方便日常调用：

```python
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
```

## 四、应用场景

### 4.1 放样计算

在施工放样中，设计坐标→现场测设：

1. 根据设计图纸读取待放样点坐标
2. 反算测站到放样点的方位角和距离
3. 全站仪定向后转动相应角度、测设距离

### 4.2 导线推算

导线测量中，每站都进行正算：

```
P1 → P2: 正算(已知P1坐标、P1P2边长、方位角) → P2坐标
P2 → P3: 正算(已知P2坐标、P2P3边长、方位角) → P3坐标
```

## 五、常见错误

- ❌ 使用 Excel 时反三角函数的弧度/度混淆
- ❌ 方位角未处理负值（结果应为 0°~360°）
- ❌ 误将磁方位角当坐标方位角使用
- ✅ 推荐：统一使用 `atan2(dy, dx)` 自动处理象限
