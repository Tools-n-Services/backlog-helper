import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Приведение базы к известному состоянию перед прогоном.
 *
 * Тест паритета сравнивает выдачу с фикстурами поимённо и по счётчикам,
 * а тесты мутаций создают обращения. Без пересева прогон идёт по данным,
 * которые оставил предыдущий (свой или e2e), и «19 обращений на доске»
 * однажды перестаёт быть правдой — причём выяснится это на тесте,
 * который к причине отношения не имеет.
 *
 * Ровно так один раз и вышло: пересев не отработал, ошибка была проглочена,
 * и вместо «сид упал» прогон показал загадочное расхождение в счётчике доски.
 * Поэтому здесь два разных случая, и они обрабатываются по-разному:
 * базы нет — пропускаем молча (тесты, которым она нужна, пропустят себя
 * сами и скажут об этом); база есть, а сид упал — валим прогон немедленно.
 *
 * ВНИМАНИЕ: пересев стирает содержимое локальной базы разработки.
 */
export default async function setup() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  if (!process.env.DATABASE_URL) return

  if (!(await databaseReachable())) {
    console.warn(
      'База недоступна — пересев пропущен. Тесты, которым нужна база, пропустятся: pnpm db:up',
    )
    return
  }

  /* Ошибку сида НЕ глушим: на достижимой базе она означает, что данные
     останутся от прошлого прогона, и половина проверок станет ложью. */
  execFileSync('pnpm', ['db:seed'], { stdio: 'inherit' })
}

async function databaseReachable(): Promise<boolean> {
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    return false
  }
}
