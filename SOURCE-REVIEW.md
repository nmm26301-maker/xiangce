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
