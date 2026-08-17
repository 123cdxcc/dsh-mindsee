# MindSee

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek cannot see pictures. MindSee gives it a way to look.

Paste a screenshot into the composer, or point at a JPEG, PNG, or WebP on your machine. The image is described through [MindSee](https://mindsee.app); DeepSeek answers from that description. You stay on the same model—there is no need to switch to a vision model.

## Install

You will need [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and the web profile.

```bash
dsh plugin --profile web add github:123cdxcc/dsh-mindsee
```

Restart `dsh web` when it finishes.

The first install may pause and ask you to allow a build. That is expected: GitHub ships source, and the plugin compiles on your machine. Add the following to the web profile’s `pnpm-workspace.yaml`, then run the same command once more:

```yaml
allowBuilds:
  dsh-mindsee: true
```

## Connect your token

1. Create an access token at [mindsee.app](https://mindsee.app).
2. In DeepSeek Harness, open **Settings → Plugins → MindSee**.
3. Paste the token and save.

## Ask with a picture

Paste an image into the composer and write your question in the same message. JPEG, PNG, and WebP are supported, up to 20 MB.

A local file path works just as well, if you would rather type than paste.
