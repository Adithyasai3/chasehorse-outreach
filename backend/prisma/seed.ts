/*
 * Optional development seed. Creates ONE demo account with ChaseHorse's service
 * catalog and business context so AI features have something to work with.
 *
 * It deliberately creates no companies, contacts, leads or emails: all prospect
 * data must come from Enricho or be entered by the user.
 *
 *   SEED_EMAIL=you@example.com SEED_PASSWORD='a-long-password' npm run seed
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICES = [
  {
    name: 'Multi-city warehousing & fulfilment',
    description: 'Warehousing and order fulfilment across multiple cities so inventory sits closer to customers and orders ship faster.',
    targetIndustries: ['D2C', 'E-commerce', 'Retail', 'FMCG', 'Consumer goods'],
  },
  {
    name: 'Inter-state freight (FTL / PTL)',
    description: 'Tracked full-truckload and part-truckload line-haul transportation between plants, warehouses and distributors.',
    targetIndustries: ['Manufacturing', 'Industrial', 'FMCG', 'Automotive'],
  },
  {
    name: 'Cold chain logistics',
    description: 'Temperature-controlled storage and refrigerated transport for perishable and temperature-sensitive goods.',
    targetIndustries: ['Pharmaceuticals', 'Dairy', 'Food processing', 'FMCG'],
  },
  {
    name: 'Reverse logistics & returns',
    description: 'Return pickups, quality checks and re-induction of returned stock into sellable inventory.',
    targetIndustries: ['E-commerce', 'D2C', 'Fashion', 'Consumer electronics'],
  },
  {
    name: 'Cross-border freight & customs',
    description: 'Ocean and air freight forwarding with customs clearance and port coordination for importers and exporters.',
    targetIndustries: ['Import and export', 'Manufacturing', 'Chemicals', 'Electronics'],
  },
];

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const key = await new Promise<Buffer>((res, rej) => crypto.scrypt(password, salt, 64, { N: 16384 }, (e, k) => (e ? rej(e) : res(k))));
  return `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function main() {
  const email = (process.env.SEED_EMAIL || 'demo@chasehorse.local').toLowerCase();
  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD || crypto.randomBytes(12).toString('base64url');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed: ${email} already exists, nothing to do.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: 'ChaseHorse Sales',
      passwordHash: await hashPassword(password),
      settings: {
        create: {
          businessName: 'ChaseHorse',
          businessDescription:
            'ChaseHorse provides logistics and supply-chain services: warehousing and fulfilment, inter-state freight, cold chain, reverse logistics and cross-border freight.',
          valueProposition: '',
          idealCustomerProfile:
            'Companies that physically move goods at scale: manufacturers, D2C and e-commerce brands, FMCG, pharma and food businesses with multi-location distribution.',
          senderName: 'ChaseHorse Sales',
        },
      },
      services: { create: SERVICES.map((s) => ({ ...s, valueProposition: '' })) },
    },
  });

  console.log(`Seed: created ${user.email}`);
  if (generated) console.log(`Seed: generated password (shown once): ${password}`);
  console.log('Seed: add verified value propositions and case studies under Settings → Business before generating emails.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
