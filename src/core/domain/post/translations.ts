/**
 * Перевод обращений и комментариев проходом воркера (FR-181).
 *
 * Почему не в момент отправки: багрепорт обязан сохраниться, даже когда
 * переводчик отвечает пятой секундой или не отвечает вовсе. Человек, у
 * которого «отправить» крутится десять секунд из-за чужого сервиса, второй
 * раз не напишет. Та же причина, по которой письма уходят отдельным проходом.
 *
 * Очередь — это сама строка: `source_locale` есть, `translated_at` пуст.
 * Отдельной таблицы задач нет, потому что задача здесь ровно одна на строку
 * и живёт ровно до первого успеха.
 */

import { locales, type Locale, isLocale } from '@/core/content'
import { prisma } from '@/core/db'
import {
  translate,
  translateModel,
  translateProvider,
  translationReady,
} from '@/core/translate'

/**
 * Сколько строк берём за проход.
 *
 * Проход идёт каждые несколько минут, и разгребать тысячу обращений одним
 * заходом незачем: при аварии провайдера так теряется вся минута работы,
 * а не двадцать строк.
 */
const BATCH = 20

/**
 * Сколько раз пробуем перевести.
 *
 * Без предела строка, которую провайдер не берёт в принципе — слишком
 * длинная, отказ модели, — возвращалась бы в каждый проход навсегда и жгла
 * деньги. Три попытки покрывают сетевую икоту и лимит запросов.
 */
const MAX_ATTEMPTS = 3

/** Про ненастроенный перевод сообщаем один раз за запуск, а не каждый проход. */
let warned = false

export interface TranslationRun {
  /** Переведённых обращений. */
  posts: number
  /** Переведённых комментариев. */
  comments: number
  /** Строк, где провайдер отказал: попытка засчитана, строка вернётся. */
  failed: number
  /** Провайдер выключен или не настроен — проход не делал ничего. */
  skipped: boolean
}

/**
 * Перевести всё, что ждёт перевода.
 *
 * Порядок — от старых к новым: обращение, ждущее с утра, важнее только что
 * отправленного, иначе при заторе старые не переведутся никогда.
 */
export async function translatePending(limit = BATCH): Promise<TranslationRun> {
  const run: TranslationRun = { posts: 0, comments: 0, failed: 0, skipped: false }
  const ready = translationReady()
  if (!ready.ok) {
    /* Ненастроенный перевод — не ошибка обращения: строки остаются в очереди
       с нетронутым счётчиком попыток и переведутся, когда появится ключ.
       Причину говорим один раз за запуск: молчаливо не работающий перевод —
       это полдня недоумения, а строка в каждый проход — мусор в журнале. */
    if (!warned) {
      warned = true
      console.warn(`[translate] перевод не работает: ${ready.reason}`)
    }
    run.skipped = true
    return run
  }

  const [posts, comments] = await Promise.all([
    prisma.post.findMany({
      where: {
        translatedAt: null,
        sourceLocale: { not: null },
        translateAttempts: { lt: MAX_ATTEMPTS },
        /* Отклонённое обращение не увидит никто — переводить его значит
           платить за текст, который останется в архиве модерации. */
        moderation: { not: 'rejected' },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, title: true, details: true, sourceLocale: true },
    }),
    prisma.comment.findMany({
      where: {
        translatedAt: null,
        sourceLocale: { not: null },
        translateAttempts: { lt: MAX_ATTEMPTS },
        deletedAt: null,
        /* Внутренние заметки команды публично не видны; переводить их —
           тратить деньги на текст, у которого один читатель. */
        internal: false,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, body: true, sourceLocale: true },
    }),
  ])

  for (const post of posts) {
    const from = asLocale(post.sourceLocale)
    if (!from) {
      /* Язык записан, но нам неизвестен: снимаем с очереди, а не крутим. */
      await prisma.post.update({ where: { id: post.id }, data: { translatedAt: new Date() } })
      continue
    }

    let ok = true
    for (const to of targetsFor(from)) {
      const title = await translate(post.title, from, to)
      if (!title.ok) {
        console.warn(`[translate] обращение ${post.id} → ${to}: ${title.error}`)
        ok = false
        continue
      }

      /* Тело бывает пустым — у идеи из одной строки заголовка. Тогда
         второй вызов не делаем: платить за перевод пустоты незачем. */
      let body = ''
      if (post.details.trim()) {
        const details = await translate(post.details, from, to)
        if (!details.ok) {
          console.warn(`[translate] обращение ${post.id} → ${to}: ${details.error}`)
          ok = false
          continue
        }
        body = details.text
      }

      await store({ postId: post.id, locale: to, title: title.text, body })
    }

    await finish('post', post.id, ok)
    if (ok) run.posts++
    else run.failed++
  }

  for (const comment of comments) {
    const from = asLocale(comment.sourceLocale)
    if (!from) {
      await prisma.comment.update({
        where: { id: comment.id },
        data: { translatedAt: new Date() },
      })
      continue
    }

    let ok = true
    for (const to of targetsFor(from)) {
      const result = await translate(comment.body, from, to)
      if (!result.ok) {
        console.warn(`[translate] комментарий ${comment.id} → ${to}: ${result.error}`)
        ok = false
        continue
      }
      await store({ commentId: comment.id, locale: to, body: result.text })
    }

    await finish('comment', comment.id, ok)
    if (ok) run.comments++
    else run.failed++
  }

  return run
}

/** Языки, на которые переводим: все, кроме языка оригинала. */
function targetsFor(from: Locale): Locale[] {
  return locales.map((entry) => entry.key).filter((key) => key !== from)
}

function asLocale(value: string | null): Locale | null {
  return isLocale(value) ? value : null
}

/**
 * Записать перевод.
 *
 * Удаление перед вставкой, а не upsert: уникальность держат частичные
 * индексы, о которых Prisma не знает, — и upsert по ним невозможен.
 * Транзакция гарантирует, что строка не окажется удалённой без замены.
 */
async function store(input: {
  postId?: string
  commentId?: string
  locale: Locale
  title?: string
  body: string
}): Promise<void> {
  const owner = input.postId ? { postId: input.postId } : { commentId: input.commentId }
  await prisma.$transaction([
    prisma.translation.deleteMany({ where: { ...owner, locale: input.locale } }),
    prisma.translation.create({
      data: {
        ...owner,
        locale: input.locale,
        title: input.title ?? null,
        body: input.body,
        provider: translateProvider(),
        model: translateModel(),
      },
    }),
  ])
}

/**
 * Снять строку с очереди или засчитать попытку.
 *
 * Успех — это перевод на все языки: наполовину переведённое обращение
 * выглядит для читателя второго языка так же, как непереведённое.
 */
async function finish(kind: 'post' | 'comment', id: string, ok: boolean): Promise<void> {
  const data = ok
    ? { translatedAt: new Date() }
    : { translateAttempts: { increment: 1 } }
  if (kind === 'post') await prisma.post.update({ where: { id }, data })
  else await prisma.comment.update({ where: { id }, data })
}
