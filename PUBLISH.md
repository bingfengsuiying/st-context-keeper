# 发布与更新

这份文件是给仓库维护者看的，普通使用者看 `README.md` 即可。

## 1. 在 GitHub 建仓库

打开 <https://github.com/new>：

- Repository name 填 `st-context-keeper`（和插件文件夹同名，手机安装后目录名才一致）
- 可见性按需选择 Public / Private
- **不要**勾选 “Add a README file”“Add .gitignore”“Choose a license”，本地已经有了

## 2. 推送到 GitHub

在仓库根目录执行（把 `bingfengsuiying` 换成实际用户名）：

```bash
git remote add origin https://github.com/bingfengsuiying/st-context-keeper.git
git branch -M main
git push -u origin main
git push origin --tags
```

推送时会要求登录：密码位置填 **Personal Access Token**（GitHub 已不支持账号密码），
令牌需要 `repo` 权限。也可以改用 SSH：

```bash
git remote set-url origin git@github.com:bingfengsuiying/st-context-keeper.git
git push -u origin main
```

## 3. 打版本标签 / 发 Release（可选）

```bash
git tag -a v1.1.0 -m "聊天保留层 v1.1.0"
git push origin v1.1.0
```

然后在 GitHub 的 **Releases → Draft a new release** 里选择这个 tag，
可以把 `st-context-keeper-1.1.0.zip` 作为附件上传，方便别人直接下载。

## 4. 手机拉取

### 酒馆内安装

扩展面板 → **Install extension** → 填仓库地址：

```
https://github.com/bingfengsuiying/st-context-keeper
```

### Termux

```bash
cd ~/SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/bingfengsuiying/st-context-keeper.git
```

更新：

```bash
cd ~/SillyTavern/public/scripts/extensions/third-party/st-context-keeper
git pull
```

拉取后刷新酒馆页面即可，设置和聊天里的排除标记都不受影响。

### 下载 ZIP

GitHub 页面 → **Code → Download ZIP** → 解压 → 把 `st-context-keeper` 文件夹放到
`public/scripts/extensions/third-party/` 下。

## 如果手机访问不了 GitHub

- 优先用能访问 GitHub 的网络环境再安装；
- 或者先在电脑上下载 ZIP，用数据线 / 网盘传到手机，按上面的“下载 ZIP”方式放进去；
- 也可以把仓库镜像到 Gitee 等平台，再用镜像地址安装（酒馆支持任意 git 地址）。

## 日常更新流程

```bash
# 改完代码后
git add -A
git commit -m "fix: 说明改了什么"
git push

# 发新版本时
git tag -a v1.1.1 -m "v1.1.1"
git push origin v1.1.1
```

手机端 `git pull` 或重新安装即可。
