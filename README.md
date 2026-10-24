# FlipYear 相册书 · 2.0.0

安卓本地年度照片书的个人实现。黑色书房背景、年度转盘、照片封面、十二个月的日历纸张和卷页动画。

## 使用

1. 保留旧版应用，直接安装 FlipYear-v2.0.0.apk。包名与开发签名沿用 1.0，首次启动会迁移旧版相册。
2. 点击「连接系统相册」，由系统选择照片授权范围。允许部分照片也可以生成对应年鉴；拒绝后仍可手动制作相册。
3. 选择年份，翻开封面，滑动或用按钮翻阅月份；横屏/宽屏显示双页。
4. 点日期查看完整比例的照片，或用「查看本月照片」进入列表；年度封面可以更换。
5. 「相册」中创建主题照片书，可编辑文案、日期、顺序、页面样式，导入或删除照片。
6. 「今日」显示往年同月同日的照片；「偏好」提供浅/深色、减少动效、翻页速度、备份与开源许可。

## 照片与日期

- 系统年鉴只保存 MediaStore 索引，预览按需在手机上生成；不复制整套原始照片、不上传。
- 系统照片增删变化会触发索引刷新，也可手动重新扫描。
- 优先使用拍摄日期；系统缺失该时间时按入库时间归档，并在首页显示数量。两个时间都缺失时不伪造日期。
- 手动导入优先读取系统/EXIF 日期，其次识别文件名中的 YYYYMMDD 或 YYYY-MM-DD 日期。无法确认时留空，可在编辑页填写。
- 自建相册导入图片会转换为长边最多 1600px 的 JPEG；系统照片预览也最多 1600px。手机原始照片不修改。
- 月历缩略图会裁成单元格形状，完整照片预览采用 contain，不裁切边缘。
- 只处理静态照片；视频、Live Photo、自动挑选最佳照片不在本版范围内。

## 备份与升级

自建相册使用 IndexedDB 保存，可导出 JSON 并恢复为新相册。系统年鉴引用手机原图，源照片删除、授权收回或设备更换后需要重新连接，不包含在自建相册备份中；请用系统相册的备份功能保管原图。

v1 的 file origin 数据通过同源迁移页读取，先写入应用私有临时备份，再交给 v2 本地 HTTPS origin 的 IndexedDB。只有新数据库写入成功才清理临时备份。未修改 v1 原数据库。迁移失败会提示并保留数据；不要先卸载旧版。

两版开发签名证书 SHA-256 相同：bc1f2cbc5fbfd8a72b23d7517135eb507f89c45b861ba0da2410b060a75e4ab7。

## 安卓与构建

- minSdk 26 / Android 8.0，targetSdk 34，compileSdk 35；建议更新 Android System WebView。
- 申请 READ_MEDIA_IMAGES、Android 14 部分照片权限及旧系统 READ_EXTERNAL_STORAGE；只有点击连接相册时才申请。手动选图仍使用系统文件选择器。
- 不申请 INTERNET、管理所有文件或定位权限。https://flipyear.local 是 WebView 内部拦截的本地资源路径，不访问服务器。
- Android Studio：JDK 17、AGP 8.7.3、Gradle 8.9、SDK 35；工程无 Gradle Wrapper，可使用本机配置。
- Linux SDK 构建：设置 ANDROID_HOME，执行 bash build-android.sh。可用 ANDROID_BUILD_TOOLS / ANDROID_JAR 指定 SDK 路径。
- signing/flipyear-debug.jks 是开发版调试签名，别名 androiddebugkey，标准调试口令 android。只用于开发版覆盖安装。

主要源码：app/src/main/assets/index.html、yearbook.js、yearbook.css；安卓容器 MainActivity.java、MediaLibrary.java。

`python3 scripts/build-web.py` 生成自包含 FlipYear.html；网页版可手动导入，系统照片库连接仅在 APK 中可用。网页版与 APK 本地数据独立，可用自建相册备份迁移。

## 开源与验证

翻页采用固定版本 @gullabs/flipbook-core 3.2.2（MPL-2.0），无运行时依赖。对应源码和许可证见 third_party/flipbook-core；方案比较、维护状态、限制和来源见 SOURCE-REVIEW.md。

Node + Playwright + Chromium 环境下执行：

```bash
node tests/functional.cjs
node tests/yearbook.cjs
```

可通过 CHROME_BIN 指定浏览器。测试涵盖编辑、持久化、备份/恢复、月历闰年、卷页正反向、快慢触摸、宽屏双页、旧状态迁移与部分授权回调。APK 编译、对齐、签名校验通过；尚未在安卓真机或模拟器安装验证权限对话框、MediaStore 和 WebView。

尚未提供桌面小组件、回忆通知、云同步和 PDF/视频导出。

项目仓库：https://github.com/nmm26301-maker/xiangce 。源码、开发签名、测试记录和安装包在该仓库维护。安装包位于 releases/FlipYear-v2.0.0.apk。

示例照片为内置 Unsplash 演示图片（photo-1470770841072-f978cf4d019e、photo-1464822759023-fed622ff2c3b、photo-1500534623283-312aade485b7、photo-1473448912268-2022ce9509d8、photo-1500530855697-b586d89ba3ee、photo-1441974231531-c6227db76b6e），运行时不联网获取。
