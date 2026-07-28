import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'design system/**',
      'next-env.d.ts',
      /* Клиент Prisma генерируется из схемы: править его бессмысленно,
         а замечания линтера к нему — шум на несколько тысяч строк. */
      'src/generated/**',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      /*
       * Правило форка: UI работает с контрактом queries, а не с его реализацией
       * (03-architecture.md, правило 3; docs/08-dev-plan.md, правило 1).
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/queries/db/*'],
              message:
                'UI и features импортируют контракт @/queries, а не его реализацию.',
            },
          ],
        },
      ],
    },
  },
]

export default config
