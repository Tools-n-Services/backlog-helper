/**
 * Next.js читает .env сам, отдельно запущенный vitest — нет. Тестам,
 * которые ходят в базу, нужен DATABASE_URL, поэтому загружаем его здесь.
 */

import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
