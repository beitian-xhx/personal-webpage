# 我的名字 · 个人网站

基于 [Liquid Stack](https://github.com/Jingyuan-Zheng/Liquid-Stack) 的 Hugo 个人博客，界面复刻自 [xizhiyun1995-netizen.github.io](https://xizhiyun1995-netizen.github.io/)，内容已替换为本站自己的数据。

## 技术栈

- Hugo（Extended）+ Liquid Stack 主题
- 双语内容（en / zh），默认中文优先
- Sveltia CMS 后台（/admin/，GitHub backend）

## 本地运行

```bash
hugo server -D
```

正式构建：

```bash
hugo --minify --cleanDestinationDir --ignoreCache
```

## 需要你替换的占位内容

- `hugo.yaml`：站点标题、简介、社交链接（当前使用 `yourname` / `you@example.com` 占位）
- `content/page/about/`：关于页中的姓名（“我的名字”）与联系方式
- `assets/admin/cms-config-base.yml`：CMS 的 GitHub 仓库地址（当前为 `northernday/personal-webpage`，按实际部署仓库修改）
- `static/img/`：头像等图片资源

## 内容目录

- `content/post/`：文章（双语，`index.md` 英文 + `index.zh.md` 中文）
- `content/page/`：关于、归档、搜索、站点地图等页面
- `data/`：资源导航、照片墙、友链等数据（可选启用）

## 部署

推送到 GitHub 仓库后，GitHub Actions 自动用 Hugo Extended 构建并发布 GitHub Pages；也可直接交给 Netlify 等支持 Hugo 的平台构建。
