# 开源方案评估 · 2026-10-24

先检索并核查 GitHub 仓库、包的许可证、README、API 契约和已知问题，再接入翻页引擎。

| 项目 | 已核实的维护状态 | 许可证 / 依赖 | 实现与问题 | 决策 |
|---|---|---|---|---|
| [Nodlik/StPageFlip](https://github.com/Nodlik/StPageFlip) | API 显示 pushed_at 2024-01-08；updated_at 的星标变化不算代码维护 | MIT；核心无运行时依赖 | HTML/Canvas 纸张翻页；竖屏返回效果见上游 #9/#49；维护间隔较长 | 作为方案来源与问题对照，不直接接入旧版本 |
| [gul-labs/flipbook](https://github.com/gul-labs/flipbook) | 主分支提交 3fb7192（2026-10-01）；2026-10-23 仍有依赖更新 PR | 核心 MPL-2.0，React 包 MIT；本项目仅使用零运行时依赖核心 | 修复竖屏反向卷页、透明纸张、零时长动效等；Android WebView 不在上游 CI；旋转宿主会影响触摸命中 | 采用 npm 精确版本 @gullabs/flipbook-core 3.2.2，保留全部许可和对应源码 |
| [blasten/turn.js](https://github.com/blasten/turn.js) | API 显示 pushed_at 2024-02-11 | README 明确 non-commercial BSD；依赖 jQuery 1.7+ | 公开仓库为第 3 版，更新的第 4 版在其网站；公开版本较旧 | 许可证限制与依赖不适合本项目，不采用 |

## 接入原则与实测修正

- 未修改第三方翻页几何算法；只通过 PageFlip、loadFromHTML、turnToPage、flipNext/flipPrev、cancelTurn、getVisiblePages 等公开 API 调用。
- 对照 3.2.2 类型定义使用 sizing、hardCovers、allowTouchScroll、respectInteractiveContent、flipOnClick，未继续使用旧版无效选项。
- 页根节点的布局由引擎控制，页面内容使用内层容器；不旋转引擎祖先节点。装饰性书封与纸边单独处理。
- 月历照片单元格支持轻点预览、键盘操作和独立的「查看本月照片」入口；滑动不被日期按钮截断。
- 上游快速滑动判定时间为 250ms。较慢的明确水平触摸释放通过公开 cancelTurn + flipNext/flipPrev 完成；取消和多指操作不提交翻页。
- 真实 Chromium 触屏事件测试覆盖快滑、慢滑、反向翻页；未以鼠标拖动代替全部触屏测试。
- Android WebView / 系统权限仍需真机验证，未将浏览器测试等同于真机通过。

## 来源与分发

- 固定 npm 包：@gullabs/flipbook-core@3.2.2，原 tarball SHA-1：8ce8f1a15a1c0962e91c7e1b1934d0ddc0af0dc6。
- 已核对主分支源码参考：[3fb7192c02ecca559d67192d15a1479fd7cf3af8](https://github.com/gul-labs/flipbook/tree/3fb7192c02ecca559d67192d15a1479fd7cf3af8)。实际分发对应源码以 npm 包内 sourcemap 的 sourcesContent 为准。
- 完整许可证：third_party/flipbook-core/LICENSE；对应源码：source-map.json；所有 sourcesContent 已随包保留。
- APK / 单文件网页均提供「偏好 → 开源组件与许可证 → 导出引擎源码与许可证」，导出的 JSON 中包含完整许可证和对应源文件内容。
- 不引入 React、jQuery、远程 CDN 或运行时 npm 下载。

## 产品与安卓 API 参考

- [FlipYear 官方产品说明](https://flipyear.app/)及 App Store 官方截图用于核对年度转盘、月历布局、主题书和那年今日；原版截图与素材未打包进应用。
- [Android 部分照片授权](https://developer.android.com/about/versions/14/changes/partial-photo-video-access)：区分完整 / 部分 / 拒绝授权，支持重新选择和刷新。
- [Android ExifInterface](https://developer.android.com/reference/android/media/ExifInterface)：对用户选定照片读取拍摄日期和方向，不写入原图。


## v2.1 桌面小组件方案比较（2026-10-24）

| 项目 | 维护与许可核对 | 实现与依赖 | 已知问题／取舍 | 本项目处理 |
|---|---|---|---|---|
| [fibelatti/photo-widget](https://github.com/fibelatti/photo-widget/tree/68ca1e1059e3005ba7511311dbec9f7ebe4cf632) | main 68ca1e1，提交 2026-10-24；Apache-2.0 | AppWidgetProvider + RemoteViews；Kotlin、Compose、Hilt、Room、Coil、WorkManager | Provider 中专门处理宿主位图上限、异步广播超时、并发渲染；[开放请求 #196](https://github.com/fibelatti/photo-widget/issues/196) 讨论那年今日及空状态，不将它当作已实现功能 | 借鉴有界解码、整组视图替换、逐实例配置、受限 goAsync 生命周期，不引入整套依赖，不复制源码 |
| [android/platform-samples](https://github.com/android/platform-samples/tree/177c3b92c387894648d0a2d42d238e265b05bbc3/samples/user-interface/appwidgets) | main 177c3b9，提交 2026-10-23；Apache-2.0 | 官方 AppWidgetManager / AppWidgetProvider 示例；样例工程使用 Kotlin 与 Compose | 示例不是完整照片产品；固定、配置返回值、桌面支持与取消行为需由应用处理 | 使用平台 Java API，与现有无 AndroidX 依赖的 APK 构建保持一致 |

- 对照官方 [配置指南](https://developer.android.com/develop/ui/views/appwidgets/configuration)、[异步更新指南](https://developer.android.com/develop/ui/views/appwidgets/advanced) 和 [基础小组件指南](https://developer.android.com/develop/ui/views/appwidgets)。
- 新增实现为本项目原生 Java / XML；无第三方小组件代码或新增运行时依赖，原 MPL 引擎许可分发不变。
- 回忆查询按每个历史年份构造本地时区的日初／次日日初区间，避免 UTC 日期误归档、夏令时固定 24 小时错误和闰日自动变成 2 月 28 日。只使用 DATE_TAKEN，最多取 128 个匹配。
- 固定照片保存 content URI 与系统持久授权，不缓存原图副本。每次预览通过 ContentResolver 验证访问权；清理授权前检查其他实例的引用。
- 全量 updateAppWidget 替换视图；位图长边最大 400px，且随宿主像素预算缩小；解码和查询放到后台，广播最长保留 8 秒。
- 系统 30 分钟周期可能因省电延迟；提供手动刷新。无精确零点更新承诺，也不借助常驻服务绕过系统限制。
- 已完成 JVM 日期策略与浏览器桥接测试；尚无安卓桌面宿主／授权生命周期实测，记录在 TEST-RESULTS.md。
