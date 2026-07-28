/**
 * Сид базы демонстрационными данными из `config/seed.ts`.
 *
 * Разложение детерминированное: один и тот же вход даёт одни и те же даты
 * голосов и комментариев. Благодаря этому пересев не меняет порядок ленты,
 * и тесты, проверяющие сортировку и счётчики, остаются осмысленными.
 *
 * Что здесь материализуется полностью, а не изображается числом:
 *
 *   голоса      — все ~14 тысяч, каждый отдельной строкой от своего человека.
 *                 Иначе vote_count, который ставит триггер, разойдётся
 *                 с числом на карточке, и первый же пересчёт покажет ложь.
 *   комментарии — все, включая добивку из общего пула до заявленного числа.
 *   история     — статусные переходы строками status_change, а не выводом
 *                 из текущего статуса на лету.
 *   дубликаты   — смерженные обращения существуют как настоящие строки
 *                 с merged_into_id, отдавая переход на целевое.
 *
 * Идемпотентен: начинает с очистки таблиц, поэтому `pnpm db:seed` можно
 * запускать сколько угодно раз.
 */

import { existsSync } from 'node:fs'

import { PrismaPg } from '@prisma/adapter-pg'

import { product } from '@config/product'
import { statuses as statusConfig } from '@config/statuses'
import { postTypes } from '@config/post-types'
import { slaPolicies, segmentWeights } from '@config/scoring'
import {
  categories as categoryFixtures,
  changelogSeeds,
  defaultTriage,
  detailsFor,
  etaByTitle,
  expandComments,
  expandMerged,
  expandPosts,
  intakeSourceNames,
  maxVotesPerPost,
  mulberry32,
  people,
  statusChains,
  triageByTitle,
  type ExpandedComment,
  type ExpandedPost,
} from '@config/seed'
import { trendScore } from '@/core/domain/shared/trending'
import { slaDueAt } from '@/core/domain/triage/sla'
import { slugify } from '@/core/slug'
import { PrismaClient } from '@/generated/prisma/client'
import type { Frequency, Privacy } from '@/generated/prisma/enums'

if (existsSync('.env')) process.loadEnvFile('.env')

const MS_PER_DAY = 86_400_000
const now = new Date()
const at = (agoDays: number) => new Date(now.getTime() - agoDays * MS_PER_DAY)

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/** Порядок обратный зависимостям: сначала то, на что ссылаются. */
const TABLES_IN_WIPE_ORDER = [
  'insight', 'backlog_post', 'backlog_item', 'status_map', 'internal_status', 'theme',
  'changelog_post', 'changelog_change', 'changelog_entry',
  'merge_log', 'status_change', 'post_tag', 'subscription', 'attachment',
  'comment_mention', 'comment_like', 'comment', 'vote', 'post',
  'sla_policy', 'intake_source', 'post_type', 'status',
  'tag', 'category', 'board',
  /* Сессии и ссылки входа — тоже данные установки. Без их очистки
     выданные ссылки копятся между пересевами, и счётчик «не больше пяти
     ссылок в час на адрес» срабатывает на ровном месте. */
  'session', 'verification_token',
  'app_user', 'company',
]

async function wipe() {
  /* TRUNCATE ... CASCADE одним оператором: он не спотыкается о порядок
     внешних ключей и на порядок быстрее, чем deleteMany по таблицам. */
  const list = TABLES_IN_WIPE_ORDER.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/* ─────────────────────────── Справочники ──────────────────────────── */

async function seedStatuses() {
  await prisma.status.createMany({
    data: statusConfig.map((s) => ({
      key: s.key,
      name: s.name,
      /* Цвет — имя токена темы, не hex: правила форка запрещают хранить
         конкретные цвета в данных. */
      color: `status-${s.key}`,
      position: s.position,
      showOnRoadmap: s.showOnRoadmap,
      isTerminal: s.isTerminal,
      isDefault: s.isDefault ?? false,
    })),
  })
  const rows = await prisma.status.findMany()
  return new Map(rows.map((r) => [r.key, r.id]))
}

async function seedPostTypes(statusIds: Map<string, string>) {
  for (const [i, type] of postTypes.entries()) {
    await prisma.postType.create({
      data: {
        key: type.key,
        name: type.name,
        description: type.description,
        /* Форма типа целиком уезжает в jsonb: в базе это данные, а значит
           её можно менять без выкладки кода (FR-502). */
        formSchema: JSON.parse(JSON.stringify(type.formSchema)),
        allowedStatusIds: type.allowedStatusKeys.flatMap((k) => {
          const id = statusIds.get(k)
          return id ? [id] : []
        }),
        defaultStatusId: statusIds.get(type.defaultStatusKey) ?? null,
        defaultPrivacy: type.defaultPrivacy as Privacy,
        allowsVotes: type.allowsVotes,
        voteLabel: type.voteLabel,
        defaultSort: type.defaultSort,
        goesToBacklog: type.goesToBacklog,
        publicFeed: type.publicFeed,
        enabled: type.enabled,
        position: i,
      },
    })
  }
  const rows = await prisma.postType.findMany()
  return new Map(rows.map((r) => [r.key, r.id]))
}

async function seedIntakeSources() {
  await prisma.intakeSource.createMany({
    data: Object.entries(intakeSourceNames).map(([key, name]) => ({
      key,
      name,
      /* Почта и API не публикуются автоматически: чужая переписка не должна
         попадать в публичную ленту без решения человека (FR-558). */
      autoPublish: key !== 'email' && key !== 'api',
    })),
  })
  const rows = await prisma.intakeSource.findMany()
  return new Map(rows.map((r) => [r.key, r.id]))
}

async function seedSlaPolicies(typeIds: Map<string, string>) {
  await prisma.slaPolicy.createMany({
    data: slaPolicies.map((p, i) => ({
      postTypeId: p.typeKey ? (typeIds.get(p.typeKey) ?? null) : null,
      severity: p.severity,
      firstResponseHours: p.firstResponseHours,
      position: i,
    })),
  })
}

async function seedBoards() {
  await prisma.board.createMany({
    data: product.boards.map((b) => ({
      slug: b.slug,
      name: b.name,
      description: b.description,
      visibility: b.visibility,
      position: b.position,
      hiddenFromNav: b.hiddenFromNav ?? false,
      requireCategory: b.requireCategory ?? false,
    })),
  })
  const rows = await prisma.board.findMany()
  return new Map(rows.map((r) => [r.slug, r.id]))
}

async function seedCategories(boardIds: Map<string, string>) {
  const data = Object.entries(categoryFixtures).flatMap(([boardSlug, list]) => {
    const boardId = boardIds.get(boardSlug)
    if (!boardId) return []
    return list.map((c, i) => ({ boardId, slug: c.slug, name: c.name, position: i }))
  })
  await prisma.category.createMany({ data })
  const rows = await prisma.category.findMany()
  return new Map(rows.map((r) => [`${r.boardId}:${r.slug}`, r.id]))
}

/* ──────────────────────────── Люди ────────────────────────────── */

/**
 * Роли демонстрационной команды.
 *
 * Разные намеренно: на одинаковых ролях невозможно увидеть, что разграничение
 * вообще работает, — а «модератор не может назначать роли» проверяется только
 * тем, что модератор в системе есть.
 */
const teamRoles: Record<string, 'moderator' | 'admin'> = {
  'Игорь Ремизов': 'admin',
  'Алина Ковалёва': 'moderator',
}

const OWNER_EMAIL = 'owner@example.com'

function transliterateEmail(name: string, i: number): string {
  const base = slugify(name).replace(/-/g, '.')
  return `${base || 'user'}.${i}@example.com`
}

/**
 * Именованные люди из фикстур плюс пул голосующих.
 *
 * Пул нужен потому, что уникальная пара (post_id, user_id) — главный инвариант
 * таблицы vote: 1842 голоса за одно обращение требуют 1842 разных человека.
 * Первыми голосуют именованные — тогда список голосовавших на странице
 * показывает живые имена, а не «Пользователь 417».
 */
async function seedUsers() {
  const companies = await Promise.all([
    prisma.company.create({
      data: { name: 'Сеть «Восход»', domain: 'voskhod.example', memberCount: 320, monthlySpend: 148000 },
    }),
    prisma.company.create({
      data: { name: 'Полдень', domain: 'polden.example', memberCount: 48, monthlySpend: 21000 },
    }),
  ])

  const named = await Promise.all(
    people.map((p, i) =>
      prisma.appUser.create({
        data: {
          email: transliterateEmail(p.name, i),
          name: p.name,
          role: p.role,
          isTeam: p.team ?? false,
          accessRole: p.team ? teamRoles[p.name] ?? 'moderator' : 'user',
          trusted: p.team ?? false,
          companyId: p.team ? null : (companies[i % companies.length]?.id ?? null),
          segments: p.team ? ['team'] : [Object.keys(segmentWeights)[i % 3]!],
        },
      }),
    ),
  )

  /* Владелец. Заводится отдельно, а не назначением кому-то из команды:
     право раздавать роли должно быть у того, кто ставил портал, и оно
     не должно молча появиться у случайного сотрудника из демо-данных. */
  await prisma.appUser.create({
    data: {
      email: OWNER_EMAIL,
      name: 'Ольга Северцева',
      role: 'владелец портала',
      isTeam: true,
      accessRole: 'owner',
      trusted: true,
      segments: ['team'],
    },
  })

  /* Заблокированный аккаунт нужен, чтобы состояние «аккаунт заблокирован»
     можно было открыть и проверить, а не только нарисовать. Отдельным
     пользователем, а не флагом на ком-то из авторов: блокировка не должна
     менять то, как выглядят их обращения. */
  await prisma.appUser.create({
    data: {
      email: 'banned.demo@example.com',
      name: 'Дмитрий Кравцов',
      role: 'старший смены',
      bannedAt: new Date(),
      banReason: '14 обращений с одинаковым текстом за сутки',
    },
  })

  /* Пул добивается до самого популярного обращения — больше не нужно
     никому, меньше нельзя ни одному. Считается от числа НЕкомандных:
     сотрудники продукта в списке голосующих не участвуют. */
  const namedVoters = named.filter((u) => !u.isTeam)
  const poolSize = Math.max(0, maxVotesPerPost - namedVoters.length)
  const rand = mulberry32(4242)
  const segments = Object.keys(segmentWeights)
  await prisma.appUser.createMany({
    data: Array.from({ length: poolSize }, (_, i) => ({
      email: `voter.${i}@example.com`,
      name: `Участник ${i + 1}`,
      role: 'пользователь портала',
      segments: [segments[Math.floor(rand() * segments.length)]!],
    })),
  })

  const pool = await prisma.appUser.findMany({
    where: { email: { startsWith: 'voter.' } },
    select: { id: true },
    orderBy: { email: 'asc' },
  })

  /* Именованные идут первыми: они и попадают в видимый список голосовавших. */
  const voters = [...namedVoters.map((u) => u.id), ...pool.map((u) => u.id)]

  /* Авторы, сгруппированные по сегменту.
     Автооценка приоритета взвешивает обращение сегментом репортера (FR-612),
     а сегмент — свойство человека, не обращения. Значит, у обращения от
     enterprise-клиента и автор должен быть из enterprise: раздать авторов
     по кругу и хранить сегмент отдельно — это два разных ответа на один
     вопрос, которые рано или поздно разойдутся. */
  const bySegment = new Map<string, string[]>()
  for (const user of namedVoters) {
    const segment = user.segments[0] ?? 'free'
    bySegment.set(segment, [...(bySegment.get(segment) ?? []), user.id])
  }

  /* Если голосующих окажется меньше, чем голосов у самого популярного
     обращения, распределение пойдёт по кругу и упрётся в уникальную пару
     (post_id, user_id). Ошибка при этом всплывёт не здесь, а посреди вставки
     четырнадцати тысяч строк — проверяем сразу. */
  if (voters.length < maxVotesPerPost) {
    throw new Error(
      `Голосующих ${voters.length}, а нужно минимум ${maxVotesPerPost}: ` +
        'один человек не может проголосовать за одно обращение дважды.',
    )
  }

  return {
    named: named.map((u) => u.id),
    voters,
    team: named.filter((u) => u.isTeam).map((u) => u.id),
    bySegment,
  }
}

/* ──────────────────────────── Обращения ───────────────────────────── */

interface Ids {
  boards: Map<string, string>
  categories: Map<string, string>
  statuses: Map<string, string>
  types: Map<string, string>
  sources: Map<string, string>
  users: {
    named: string[]
    voters: string[]
    team: string[]
    bySegment: Map<string, string[]>
  }
}

/**
 * Автор обращения: любой из людей нужного сегмента, выбранный
 * детерминированно по порядковому номеру обращения.
 */
function authorFor(ids: Ids, segment: string, index: number): string {
  const candidates = ids.users.bySegment.get(segment) ?? ids.users.named
  return candidates[index % candidates.length]!
}

function triageOf(post: ExpandedPost) {
  const t = triageByTitle[post.seed.title]
  const isBug = post.seed.typeKey === 'bug'
  return {
    severity: t?.severity ?? (isBug ? defaultTriage.severity : null),
    frequency: (t?.frequency ?? defaultTriage.frequency) as Frequency,
    source: t?.source ?? defaultTriage.source,
    segment: t?.segment ?? defaultTriage.segment,
    assignee: t?.assignee,
    priority: t?.priority ?? null,
    regression: t?.regression ?? false,
    /* Команда ответила. Флаг триажа уточняет это для багов, но `teamReply`
       значит ровно то же самое и для идей. */
    answered: t?.answered ?? post.seed.teamReply ?? false,
  }
}

async function seedPosts(ids: Ids, expanded: ExpandedPost[]) {
  const postIds = new Map<string, string>()

  for (const post of expanded) {
    const seed = post.seed
    const triage = triageOf(post)
    const createdAt = at(post.createdAgoDays)
    const updatedAt = at(post.updatedAgoDays)
    const boardId = ids.boards.get(seed.boardSlug)!
    const typeConfig = postTypes.find((t) => t.key === seed.typeKey)!

    const created = await prisma.post.create({
      data: {
        boardId,
        typeId: ids.types.get(seed.typeKey)!,
        sourceId: ids.sources.get(triage.source) ?? null,
        statusId: ids.statuses.get(seed.statusKey)!,
        categoryId: ids.categories.get(`${boardId}:${seed.categorySlug}`) ?? null,
        /* Автор — человек из того сегмента, который фикстура называет
           сегментом репортера: от него зависит автооценка приоритета. */
        authorId: authorFor(ids, triage.segment, expanded.indexOf(post)),
        title: seed.title,
        slug: post.slug,
        ref: post.ref,
        details: detailsFor(seed).join('\n\n'),
        eta: etaByTitle[seed.title] ?? null,
        pinned: seed.pinned ?? false,
        privacy: typeConfig.defaultPrivacy as Privacy,
        /* trend_score — денормализованная колонка, которую в рабочем режиме
           пересчитывает джоба. Здесь считается той же формулой по тем же
           датам голосов, что и на моках. */
        trendScore: trendScore(post.voteAgesDays.map(at), now),
        severity: triage.severity,
        frequency: seed.typeKey === 'bug' ? triage.frequency : null,
        priority: triage.priority,
        assigneeId:
          triage.assignee !== undefined
            ? (ids.users.named[triage.assignee % ids.users.named.length] ?? null)
            : null,
        /* «Команда уже ответила» — это не отдельный флаг, а факт первого
           ответа: та же колонка, по которой считается SLA. */
        firstResponseAt: triage.answered ? updatedAt : null,
        slaDueAt: slaDueAt(createdAt, seed.typeKey, triage.severity),
        /* «Ждём ответа автора» — needs_info_since, от неё же считается
           напоминание и авто-закрытие (FR-533). */
        needsInfoSince: seed.awaitingReporter ? updatedAt : null,
        statusChangedAt: updatedAt,
        createdAt,
        updatedAt,
      },
    })
    postIds.set(post.id, created.id)
  }

  /* Регрессии — вторым проходом: обращение ссылается на ранее исправленный
     баг, а он к моменту создания может быть ещё не заведён.

     Ссылка, а не флаг: «повтор» без указания, что именно повторилось, не даёт
     триажу ничего. Модель данных требует regression_of — обращение с той же
     подписью ошибки, закрытое как fixed (FR-525). */
  for (const post of expanded) {
    if (!triageOf(post).regression) continue

    const earlierFixed = expanded.find(
      (p) =>
        p !== post &&
        p.seed.boardSlug === post.seed.boardSlug &&
        p.seed.typeKey === 'bug' &&
        p.seed.statusKey === 'completed',
    )
    if (!earlierFixed) continue

    await prisma.post.update({
      where: { id: postIds.get(post.id)! },
      data: { regressionOf: postIds.get(earlierFixed.id)! },
    })
  }

  return postIds
}

/**
 * Голоса строками. Самая объёмная часть сида (~14 тысяч записей), поэтому
 * пакетами: по одной вставке на обращение вместо строки.
 */
async function seedVotes(ids: Ids, expanded: ExpandedPost[], postIds: Map<string, string>) {
  let total = 0
  for (const post of expanded) {
    if (post.voteAgesDays.length === 0) continue
    const postId = postIds.get(post.id)!
    /* От свежих к старым: список голосовавших на странице показывает
       последних, и первыми в нём должны оказаться именованные люди,
       а не «Участник 417» из добивочного пула. */
    const ages = [...post.voteAgesDays].sort((a, b) => a - b)
    await prisma.vote.createMany({
      data: ages.map((age, i) => ({
        postId,
        /* i-й голос — от i-го человека: уникальность пары гарантирована
           построением, а не надеждой на случайность. */
        userId: ids.users.voters[i]!,
        createdAt: at(age),
      })),
    })
    total += post.voteAgesDays.length
  }
  return total
}

async function seedComments(ids: Ids, expanded: ExpandedPost[], postIds: Map<string, string>) {
  let total = 0

  for (const post of expanded) {
    const postId = postIds.get(post.id)!
    const tree = expandComments(post)

    const insert = async (node: ExpandedComment, parentId: string | null) => {
      const person = people[node.author % people.length]!
      const authorId = person.team
        ? (ids.users.team[node.author % Math.max(1, ids.users.team.length)] ??
           ids.users.named[node.author % ids.users.named.length]!)
        : ids.users.named[node.author % ids.users.named.length]!

      const created = await prisma.comment.create({
        data: {
          postId,
          parentId,
          authorId,
          body: node.body,
          pinned: node.pinned,
          createdAt: at(node.agoDays),
          /* Помечены разосланными — как и история статусов. Это переписка
             месячной давности, письма о ней по замыслу давно ушли. Иначе
             первый же проход рассылки отправит тысячу писем об ответах,
             которых никто не писал. */
          notifiedAt: at(node.agoDays),
        },
      })
      total++
      /* Вложенность одноуровневая (FR-136): ответы на ответы не заводим. */
      for (const reply of node.replies) await insert(reply, created.id)
    }

    for (const node of tree) await insert(node, null)
  }

  return total
}

async function seedStatusHistory(ids: Ids, expanded: ExpandedPost[], postIds: Map<string, string>) {
  const data: {
    postId: string
    fromStatusId: string | null
    toStatusId: string
    changedById: string | null
    createdAt: Date
    notifiedAt: Date
  }[] = []

  for (const post of expanded) {
    const chain = statusChains[post.seed.statusKey] ?? [post.seed.statusKey]
    const span = post.createdAgoDays - post.updatedAgoDays
    /* Цепочка задана от текущего статуса к исходному — записываем в обратном
       порядке, как оно и происходило. */
    const ordered = [...chain].reverse()

    ordered.forEach((key, i) => {
      const ago = post.createdAgoDays - (span * i) / Math.max(1, ordered.length - 1)
      data.push({
        postId: postIds.get(post.id)!,
        fromStatusId: i === 0 ? null : ids.statuses.get(ordered[i - 1]!)!,
        toStatusId: ids.statuses.get(key)!,
        /* Кто перевёл, известно только для командных переходов: исходное
           «Новое» ставит система при приёме. */
        changedById: i === 0 ? null : (ids.users.team[0] ?? null),
        createdAt: at(ago),
        /* Помечены разосланными. Это история: переходы «произошли» месяцы
           назад, и письма о них по замыслу уже ушли. Без этой отметки
           первый же запуск рассылки разошлёт полторы тысячи писем
           о событиях, которых никто не совершал. */
        notifiedAt: at(ago),
      })
    })
  }

  await prisma.statusChange.createMany({ data })
  return data.length
}

/**
 * Смерженные дубликаты настоящими строками.
 *
 * Не декоративная деталь: по ссылке такого обращения из письма или из выдачи
 * поисковика пользователь обязан попасть на целевое, а не в 404 (FR-141).
 * Значит, у дубликата должны быть свой slug, свой ref и merged_into_id.
 */
async function seedMergedDuplicates(ids: Ids, expanded: ExpandedPost[], postIds: Map<string, string>) {
  let total = 0

  for (const [i, dupe] of expandMerged().entries()) {
    const target = expanded.find((p) => p.seed.title === dupe.targetTitle)
    if (!target) continue
    const targetId = postIds.get(target.id)!
    const seed = target.seed
    const boardId = ids.boards.get(seed.boardSlug)!

    {
      const source = await prisma.post.create({
        data: {
          boardId,
          typeId: ids.types.get(seed.typeKey)!,
          sourceId: ids.sources.get('portal') ?? null,
          statusId: ids.statuses.get('duplicate')!,
          authorId: ids.users.named[(i * 5 + 3) % ids.users.named.length]!,
          title: dupe.title,
          slug: dupe.slug,
          ref: dupe.ref,
          details: dupe.title,
          mergedIntoId: targetId,
          resolution: 'duplicate',
          createdAt: at(target.createdAgoDays + 5),
          updatedAt: at(target.updatedAgoDays),
        },
      })

      /* Голоса дубликата — настоящими строками.
         Без них секция «Объединённые обращения» показывает «0 голосов
         перенесено», а это единственное число, ради которого её и читают:
         оно объясняет, почему у целевого обращения счётчик больше, чем
         помнит его автор. Люди берутся с конца пула, чтобы пересечься
         с голосовавшими за целевое — именно такое пересечение и обязана
         схлопывать дедупликация при merge. */
      const voters = ids.users.voters.slice(0, dupe.movedVotes)
      if (voters.length > 0) {
        await prisma.vote.createMany({
          data: voters.map((userId, v) => ({
            postId: source.id,
            userId,
            createdAt: at(target.createdAgoDays + 4 - v * 0.01),
          })),
        })
      }

      /* Журнал слияния — то, что делает возможным откат (FR-213). */
      await prisma.mergeLog.create({
        data: {
          sourceId: source.id,
          targetId,
          mergedById: ids.users.team[0] ?? null,
          movedVoteUserIds: voters,
          createdAt: at(target.updatedAgoDays),
        },
      })
      total++
    }
  }

  return total
}

async function seedChangelog(postIds: Map<string, string>, expanded: ExpandedPost[]) {
  for (const entry of changelogSeeds) {
    const publishedAt = at(entry.agoDays)
    const created = await prisma.changelogEntry.create({
      data: {
        slug: entry.slug,
        version: entry.version,
        title: entry.title,
        lead: entry.lead,
        labels: entry.labels,
        /* Производное поле: набор типов изменений, денормализованный
           для фильтра ленты (FR-162). */
        types: [...new Set(entry.changes.map((c) => c.kind))],
        publishedAt,
        createdAt: publishedAt,
        changes: {
          create: entry.changes.map((c, i) => ({
            kind: c.kind,
            title: c.title,
            body: c.body,
            position: i,
          })),
        },
      },
    })

    /* Связь релиза с обращениями — то самое замыкание цикла (FR-165). */
    const closes = entry.closes.flatMap((title) => {
      const post = expanded.find((p) => p.seed.title === title)
      const id = post ? postIds.get(post.id) : undefined
      return id ? [{ entryId: created.id, postId: id }] : []
    })
    if (closes.length) await prisma.changelogPost.createMany({ data: closes })
  }
  return changelogSeeds.length
}

/**
 * Подписки тех, кто голосовал за показательные обращения.
 *
 * Голос подписывает автоматически (source = vote) — именно эти люди получат
 * письмо, когда обращение закроется релизом. Без подписок замыкание цикла
 * некому доставить.
 */
async function seedSubscriptions(ids: Ids, expanded: ExpandedPost[], postIds: Map<string, string>) {
  const data: { postId: string; userId: string; source: 'vote' | 'author' }[] = []

  for (const post of expanded) {
    const postId = postIds.get(post.id)!
    const subscribers = Math.min(post.voteAgesDays.length, 40)
    for (let i = 0; i < subscribers; i++) {
      data.push({ postId, userId: ids.users.voters[i % ids.users.voters.length]!, source: 'vote' })
    }
  }

  await prisma.subscription.createMany({ data, skipDuplicates: true })
  return data.length
}

/* ──────────────────────────── Запуск ──────────────────────────────── */

async function main() {
  const started = Date.now()
  console.log('Очищаю таблицы…')
  await wipe()

  console.log('Справочники…')
  const statusIds = await seedStatuses()
  const typeIds = await seedPostTypes(statusIds)
  const sourceIds = await seedIntakeSources()
  await seedSlaPolicies(typeIds)
  const boardIds = await seedBoards()
  const categoryIds = await seedCategories(boardIds)

  console.log('Люди…')
  const users = await seedUsers()

  const ids: Ids = {
    boards: boardIds,
    categories: categoryIds,
    statuses: statusIds,
    types: typeIds,
    sources: sourceIds,
    users,
  }

  const expanded = expandPosts()

  console.log(`Обращения (${expanded.length})…`)
  const postIds = await seedPosts(ids, expanded)

  console.log('Голоса…')
  const votes = await seedVotes(ids, expanded, postIds)

  console.log('Комментарии…')
  const comments = await seedComments(ids, expanded, postIds)

  console.log('История статусов…')
  const changes = await seedStatusHistory(ids, expanded, postIds)

  console.log('Объединённые дубликаты…')
  const merged = await seedMergedDuplicates(ids, expanded, postIds)

  console.log('Changelog…')
  const releases = await seedChangelog(postIds, expanded)

  console.log('Подписки…')
  const subs = await seedSubscriptions(ids, expanded, postIds)

  /* Проверка на месте: счётчики ставит триггер, и если он не сработал,
     узнать об этом лучше сейчас, а не по кривым числам в ленте. */
  const mismatch = await prisma.$queryRaw<{ ref: string; stored: number; actual: bigint }[]>`
    SELECT p."ref", p."vote_count" AS stored, count(v."id") AS actual
    FROM "post" p LEFT JOIN "vote" v ON v."post_id" = p."id"
    GROUP BY p."id", p."ref", p."vote_count"
    HAVING p."vote_count" <> count(v."id")
    LIMIT 5
  `
  if (mismatch.length > 0) {
    throw new Error(
      `Триггер счётчика голосов не отработал: ${JSON.stringify(mismatch, (_, v) =>
        typeof v === 'bigint' ? Number(v) : v,
      )}`,
    )
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `\nГотово за ${seconds} с: ${expanded.length} обращений, ${merged} объединённых, ` +
      `${votes} голосов, ${comments} комментариев, ${changes} смен статуса, ` +
      `${releases} релизов, ${subs} подписок.`,
  )

  /* Пароля нет, вход только по ссылке из письма — значит адрес и есть
     всё, что нужно знать, чтобы войти. Без этой подсказки на свежей
     установке непонятно, под кем открывать админку. */
  const accounts = await prisma.appUser.findMany({
    where: { OR: [{ isTeam: true }, { bannedAt: { not: null } }] },
    orderBy: { accessRole: 'desc' },
    select: { email: true, name: true, accessRole: true, bannedAt: true },
  })
  console.log('\nВойти можно любым из этих адресов (портал спросит только почту):')
  for (const a of accounts) {
    const what = a.bannedAt ? 'заблокирован' : a.accessRole
    console.log(`  ${a.email.padEnd(34)} ${what.padEnd(10)} ${a.name}`)
  }
  console.log('  любой voter.N@example.com          user       обычный участник')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
