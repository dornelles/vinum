import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (process.env.CI !== 'true' || databaseUrl.pathname !== '/vinum_ci') {
  throw new Error('Os dados de teste só podem ser criados no banco vinum_ci durante o CI.');
}

try {
  const [winery, redType, whiteType, classification, redGrape, whiteGrape] = await Promise.all([
    prisma.winery.findFirstOrThrow(),
    prisma.wineType.findUniqueOrThrow({ where: { name: 'Tinto' } }),
    prisma.wineType.findUniqueOrThrow({ where: { name: 'Branco' } }),
    prisma.classification.findUniqueOrThrow({ where: { name: 'Seco' } }),
    prisma.grape.findUniqueOrThrow({ where: { name: 'Cabernet Sauvignon' } }),
    prisma.grape.findUniqueOrThrow({ where: { name: 'Chardonnay' } }),
  ]);

  await prisma.wine.create({
    data: {
      id: 'ci-fixture-wine-red',
      wineryId: winery.id,
      typeId: redType.id,
      classificationId: classification.id,
      name: 'Vinho tinto do CI',
      slug: 'ci-fixture-wine-red',
      volumeMl: 750,
      alcoholPercentage: 13,
      description: 'Vinho usado apenas nos testes de integração.',
      status: 'PUBLISHED',
      grapeLinks: { create: { grapeId: redGrape.id } },
      vintages: {
        create: {
          id: 'ci-fixture-vintage-red',
          identifier: 'CI24-T01',
          year: 2024,
          status: 'Concluída',
          grapeLinks: { create: { grapeId: redGrape.id } },
        },
      },
    },
  });

  await prisma.wine.create({
    data: {
      id: 'ci-fixture-wine-white',
      wineryId: winery.id,
      typeId: whiteType.id,
      classificationId: classification.id,
      name: 'Vinho branco do CI',
      slug: 'ci-fixture-wine-white',
      volumeMl: 750,
      alcoholPercentage: 12,
      description: 'Segundo vinho usado apenas nos testes de integração.',
      status: 'PUBLISHED',
      grapeLinks: { create: { grapeId: whiteGrape.id } },
    },
  });
} finally {
  await prisma.$disconnect();
}
