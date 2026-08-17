# MindSee

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek 看不见图。MindSee 替它看。

把截图贴进输入框，或指向本地的 JPEG、PNG、WebP。画面经 [MindSee](https://mindsee.app) 转成文字，DeepSeek 据此作答。模型不用换，也不必改用视觉接口。

## 安装

需要已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，并使用 web 配置。

```bash
dsh plugin --profile web add github:123cdxcc/dsh-mindsee
```

装完后重启 `dsh web`。

第一次安装可能会要求允许构建。GitHub 提供的是源码，插件会在你的机器上编译。把下面这段写入 web 配置目录里的 `pnpm-workspace.yaml`，再执行一次同一条命令即可：

```yaml
allowBuilds:
  dsh-mindsee: true
```

## 接入令牌

1. 在 [mindsee.app](https://mindsee.app) 创建访问令牌。
2. 打开 DeepSeek Harness 的 **设置 → 插件 → MindSee**。
3. 填入令牌并保存。

## 带着图提问

在输入框里贴图，同一条消息里把问题写上。支持 JPEG、PNG、WebP，单张不超过 20 MB。

也可以直接给出本地文件路径。
