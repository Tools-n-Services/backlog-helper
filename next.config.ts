import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  /* Самодостаточная сборка для образа (В6, docs/09-install.md): в него едет
     сервер и только те зависимости, которые он действительно требует, —
     а не весь node_modules, который весит вдесятеро. */
  output: 'standalone',
  experimental: {
    serverActions: {
      /* Вложения приходят серверным действием, а видео бага — до 50 МБ
         (config/attachments.ts). Умолчание в мегабайт отвергло бы скринкаст
         на уровне фреймворка, до нашей проверки, и человек увидел бы
         не «слишком большой файл», а обрыв соединения. */
      bodySizeLimit: '64mb',
    },
  },
}

export default nextConfig
