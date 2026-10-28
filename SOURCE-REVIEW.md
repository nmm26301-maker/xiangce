# 2.8.1 显示修正与 AI 移除 · 2026-10-28

本版将自建书照片区域扩大至细边框内部，按原比例居中裁切；文字改为底部叠层，3D canvas 和兼容 HTML 阅读器保持一致，完整原图查看逻辑未变。

删除 2.8.0 的 EnhanceActivity、AiFiles、AiPolicy、AiProcess、原图分享 Provider、两个 AI JavaScript 桥接方法、增强按钮、AI 构建下载脚本、模型来源清单和许可资源。构建与 CI 不再拉取或打包增强资源。安装包不含 ncnn、RealSR、AI 模型或 AI Activity。历史 release APK 仅作为旧版存档保留。

升级清理仅限应用 files 内的三个旧功能目录；递归操作校验 canonical path，拒绝越过私有根目录，不改相册文件和外部保存图。

以下记录是已移除功能及更早版本的历史审查，不代表当前版本仍包含 AI：

# 2.8.0 内置 AI 来源与实现审查 · 2026-10-28

- 固定上游 `tumuyan/RealSR-NCNN-Android` 1.13.2（提交 `0eb16763761e46f55c6223439ca1ad20216bc4ab`），APK SHA-256 `d7b68c2589ad1cb9a953ed8ca001f6600217dceb4ee7053bc21e8c3899c4c6e7`。构建脚本校验源 APK 和 4 个提取资源；不打包外部应用界面。
- ARM64 PIE 可执行文件具有 `/system/bin/linker64` 解释器，依赖 `libncnn.so` 与 Android 系统库。以 `.so` 名装入 APK 的 lib 目录，通过 `extractNativeLibs=true` 由安装器提取，运行时校验两份本机库哈希。从 `nativeLibraryDir` 执行以符合 Android 10+ 对可写应用目录执行权限的限制。
- 命令参数使用 ProcessBuilder 数组；不经 shell、不接收用户命令；使用 CPU `-g -1`、tile 64、线程 1:2:1、4 倍 PNG 输出。上游 main.cpp 要求模型目录含 `models`，本实现采用 `models-Real-ESRGANv3-general-v1`；自动识别模型输入输出张量名。
- 模型为 Real-ESRGANv3-general x4，权重约 2.4 MB。模型加载与实际推理在主机 ncnn 验证，不冒称 Android 设备验证。原始 EXIF 方向由 PhotoDecoder 处理，输入解码有尺寸边界，输出必须为正确尺寸的 PNG 并通过预览解码。
- MIT、BSD、Apache、LLVM 例外等相关完整许可在 `app/src/main/assets/ai-engine/NOTICES.txt`。上游代码链接和二进制溯源在 manifest 中；可从 https://github.com/tumuyan/RealSR-NCNN-Android 获取源码。
- 真机仍需验收原生子进程启动、CPU 推理速度、内存及文件选择器。没有新增联网权限。

以下为之前版本的历史审查记录：

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


## v2.2 系统视频方案比较（2026-10-24）

| 项目 | 维护与许可证核对 | 实现／依赖与已知问题 | 决策 |
|---|---|---|---|
| [androidx/media](https://github.com/androidx/media/tree/8c6678b657ede1e7883fc164ef73ed483c7796c3) | 仓库 pushed_at 2026-10-23；核对 release 分支 8c6678b；Apache-2.0 | Media3 / ExoPlayer 模块提供播放状态与生命周期 API，可按需添加扩展；需要 AndroidX 依赖和 Maven 构建，编解码仍受平台／扩展限制；官方 release notes 持续记录寻址和短媒体修复 | 作为成熟设计参考。当前仅本地 MediaStore 视频，沿用无运行时依赖的 Java APK，使用平台 VideoView / MediaController，不引入整个播放框架 |
| [FossifyOrg/Gallery](https://github.com/FossifyOrg/Gallery/tree/e9812299b9d444b57072313cd2c3efd59c790f98) | main e981229；pushed_at 2026-10-24；GPL-3.0 | 独立视频页与媒体浏览联动；Kotlin / AndroidX / Media3。已关闭 [#831](https://github.com/FossifyOrg/Gallery/issues/831) 记录暂停状态下拖动进度意外开始播放 | 借鉴分离索引、静态封面和显式播放入口，以及后台暂停／释放设计；不复制 GPL 源码，不把上游关闭问题视作本应用已通过设备验证 |

- 官方依据：[共享媒体索引与分类型授权](https://developer.android.com/training/data-storage/shared/media)、[Android 14 部分照片／视频访问及 onResume 刷新](https://developer.android.com/about/versions/14/changes/partial-photo-video-access)、[VideoView](https://developer.android.com/reference/android/widget/VideoView)、[MediaMetadataRetriever](https://developer.android.com/reference/android/media/MediaMetadataRetriever)。
- 新增代码全部为本项目实现，无第三方播放器代码或依赖。通过 VideoView 的公开 API 播放，MediaController 处理拖动；页面不在 WebView 中代理视频字节流，避免缺失 Range / seek 支持。
- API 27 起使用 getScaledFrameAtTime 的有界输出；API 26 使用平台 MINI_KIND 缩略图，避免解码完整 4K 帧后才缩小。封面只作静态预览，提取失败不封锁播放入口。
- READ_MEDIA_IMAGES 与 READ_MEDIA_VIDEO 独立判定；只有两类都 full 才汇总为 full。部分授权或单类授权仍可索引对应类型；扫描失败时，已确认失去访问权的类型不能从旧快照恢复。
- 本地视频的 ID 格式、数值范围由共享 MediaPolicy 校验；原生页面不导出，不接受任意 URI / 网络源。原图与视频的 MediaStore ID 命名空间、封面缓存文件分别区分。
- 浏览器验证显式入口及权限桥接，JVM 直接验证生产权限规则；真实 MediaStore、设备解码、进度控制和后台恢复仍需安卓验证。Live Photo / Motion Photo 配对不在本次实现内。


## v2.3 主题相册视频与流式备份（2026-10-25）

| 项目 | 维护与许可证核对 | 设计／依赖与问题 | 决策 |
|---|---|---|---|
| [srikanth-lingala/zip4j](https://github.com/srikanth-lingala/zip4j) | pushed_at 2026-03-11；Apache-2.0 | Java / Android ZIP 库，支持流、加密和分卷；[SAF 流讨论 #285](https://github.com/srikanth-lingala/zip4j/issues/285) 提醒不能依赖真实文件路径；提取仍需防止 ZipSlip | 参考流式读写和条目校验设计，本次不需要加密／分卷，使用平台 java.util.zip，无新增依赖、无源码复制 |
| [apache/commons-compress](https://github.com/apache/commons-compress) | pushed_at 2026-10-22；Apache-2.0 | 多归档格式和流式处理库，依赖范围大于单一 ZIP；支持更多格式不代表应用可以忽略解压大小与文件名限制 | 仅接收自有清单协议的 ZIP，限制清单／文件／总量，未引入通用解包能力或第三方代码 |

- 对照 [Android SAF](https://developer.android.com/training/data-storage/shared/documents-files)、[应用私有存储](https://developer.android.com/training/data-storage/app-specific)、[Zip Path Traversal 防护](https://developer.android.com/privacy-and-security/risks/zip-path-traversal)、[ThumbnailUtils](https://developer.android.com/reference/android/media/ThumbnailUtils)。
- 使用系统选择器的临时 content URI 读取并复制，不保存外部文件路径，也不依赖原文件持久授权。独立副本用内部生成的 UUID v4 命名，原生播放只接受系统数字 ID 或该私有 ID。
- ZIP 第一项必须是 manifest.json，其余仅允许清单引用的 media/local-video-UUID.bin。严格名称、空暂存目录、规范路径、集合一致性、逐块大小上限和 CRC 同时生效；写入已有文件会拒绝，恢复视频重新编号。
- 64KiB 缓冲串行复制；说明最多 32MiB、单段 250MiB、整份解压合计 512MiB、最多 200 个视频。未知大小的输入同样按实际读取量限制，不依赖 ZIP 头部声明。
- 原生结果持久化为私有 JSON，经本地 WebView 资源读取；相册与处理令牌在同一 IndexedDB 快照提交。成功后确认保留，取消／失败只删除新生成的副本。未能读取数据库时不丢弃待办结果。
- 自动删除原视频、后台上传、动态照片配对、云同步和加密备份均不在本次范围。清理无引用副本由明确按钮发起，并先验证当前相册保存成功。
- 新增 AlbumArchiveTest 在 JVM 执行生产 ZIP 代码，custom-videos.cjs 验证 UI／数据库流程；安卓真实选择器、进程重建、私有视频播放和存储不足场景仍待设备验证。


## v2.4 大图交互比较（2026-10-25）

| 项目 | 维护／许可 | 实现、依赖与问题 | 决策 |
|---|---|---|---|
| [timmywil/panzoom](https://github.com/timmywil/panzoom) | GitHub pushed_at 2026-09-02；npm 固定 4.6.2；MIT | 零运行时依赖，Pointer Events、双指、焦点缩放、边界约束；[#512](https://github.com/timmywil/panzoom/issues/512) 与 [#606](https://github.com/timmywil/panzoom/issues/606) 讨论同时捏合与平移的定位；[#678](https://github.com/timmywil/panzoom/issues/678) 涉及尺寸变化 | 使用未修改的发布 min.js；pinchAndPan=false；切图销毁重建，旋转还原；边界约束下按钮缩放不使用 CSS 插值，防止快速还原读取中间尺寸 |
| [dimsemenov/PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe) | GitHub pushed_at 2025-12-04；MIT；上游正在开发 v6 | 完整灯箱、切图、焦点和手势系统；需提供图片尺寸并替换现有 UI；[#2179](https://github.com/dimsemenov/PhotoSwipe/issues/2179) 讨论宽高比例错误 | 当前已有照片／视频封面预览与原生播放桥，保留这套流程；只引入 Panzoom 负责缩放，不复制 PhotoSwipe 代码 |

- npm tarball SHA-512 与注册表 integrity 核对一致；发行脚本、package.json、完整 MIT 许可在 third_party/panzoom；APK 与单文件网页内置许可，无 CDN 请求。
- 日期与照片点击按 Pointer Events 的最大移动量区分轻点／拖动，多指取消轻点。主题书的可访问按钮语义不会屏蔽翻页拖动；视频播放按钮独立拦截 pointerdown。
- 对照 [FlipYear 官方](https://flipyear.app/)的年度书架和月历宣传截图，调整相邻月份纸层、圆角及有效周数；只参考布局，未复制其商业素材／代码，不声明视觉完全一致。


## v2.6 原文件、实况与 WebGL（2026-10-26）

| 项目 | 维护／许可证 | 实现、依赖与已知限制 | 本次取舍 |
|---|---|---|---|
| [google/libmotionphoto](https://github.com/google/libmotionphoto) | pushed_at 2026-10-26；Apache-2.0 | 官方 JPEG / HEIC / AVIF 解析、提取、构建；Java API 通过 JNI 调用 C++17，需 CMake / NDK 和 image_io、mp4v2 等原生代码；格式插件处理旧 MicroVideo，文档建议对不可信解析作隔离 | 参考公开接口、边界检查与原件／视频分离设计。当前无 JNI 构建链，本次只按官方格式实现有界 JPEG 子集；未复制库代码，不宣称支持全部厂商格式 |
| [WeiErLiTeo/MotionCraft](https://github.com/WeiErLiTeo/MotionCraft) | pushed_at 2026-10-01；Apache-2.0 | Kotlin / Compose / Room / Coil / Media3 / JNI 等完整应用依赖；支持实况浏览与转换，但设备编解码与资源是否完整仍是前提 | 参考静态照片与动态视频分开保存、主动播放的设计，不移植整套依赖，不从单张照片伪造实况 |
| [oguzhanT/turngl](https://github.com/oguzhanT/turngl/tree/f551279ad0b381340959907093a587eab9bd1f51) | pushed_at 2026-04-10；MIT；固定 f551279 | Book3D 将 Canvas 映射到分段 PlaneGeometry，按圆柱路径弯曲顶点并更新法线；依赖 Three.js。其 PDF 组件会加载网络 PDF.js，持续渲染循环、动画不可取消及资源清理需由集成方处理 | 仅提取未修改的 Book3D 源码，完全排除 PDF 组件；第一方适配器负责本地月历纹理、可取消手势、透视日期命中、按需绘制和完整 GPU 释放；未复制商业 FlipYear 资产 |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | pushed_at 2026-10-26；MIT；固定 npm 0.180.0 | WebGL 2 渲染器、相机、曲面、纹理与射线；旧设备缺少 WebGL 2，不能假定所有 WebView 都能运行 | 离线打包 0.180.0，与固定 Book3D 验证；失败／上下文丢失回退到原 MPL 兼容引擎。没有运行时 CDN、PDF 解析或联网请求 |

- 格式依据：[Android Motion Photo 1.0](https://developer.android.com/media/platform/motion-photo-format)。JPEG APP1 XMP 按命名空间读取；现代 Container:Directory 从文件尾倒推条目 Length / Padding，现代声明优先于旧 MicroVideoOffset。读取元数据最多 1MiB／512 段；XML 禁用外部实体；视频范围最多 250MiB，检查 MP4 顶层盒边界与必要标识。HEIC／AVIF、扩展 XMP、Samsung SEF 和 Apple 内容标识符自动配对不在该子集内。
- 独立 MOV / MP4 配对由用户确认，不靠同名文件自动合并；视频是否实际可解码仍由设备验证。
- 原图复制采用有界流式 I/O + fsync，记录大小与 SHA-256；预览有界解码另存缓存。版本 3 ZIP 包含原文件、关联视频与清单，继承路径白名单、CRC、解压总量限制与回滚；恢复原图再核对长度和哈希。无第三方归档代码。
- 原 turngl / Three.js 源码说明和完整 MIT 许可证位于 third_party/webgl；合并 bundle 与 APK 设置中保留声明。scripts/build-webgl.cjs 可重建离线 bundle。MPL 引擎及源码出口保持原协议。
- WebGL 在 Chromium 软件 GPU 验证真实顶点深度、射线选取、拖动和上下文恢复；不是手机 GPU 帧率报告。实际品牌／型号、系统照片提供者、HEVC / MOV 解码、权限和升级尚需真实设备。

## v2.7 大图方案

对照 [ZoomImage](https://github.com/panpf/zoomimage) 与 [Subsampling Scale Image View](https://github.com/davemorrissey/subsampling-scale-image-view)（两者 Apache-2.0）的超大图分块思路，沿用 Panzoom 手势，使用 Android 官方 BitmapRegionDecoder 解码可见区域。没有引入其 UI 库或复制其 View 代码，未新增 APK 运行时依赖。
