// Seeds default categories for a paint / coatings distribution business.
// Run with: npm run db:seed
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES: { name: string; description: string; sortOrder: number }[] = [
  {
    name: 'Raw Materials',
    description: 'Paint bases, pigments, chemicals, packaging, cans, drums, cow dung raw stock — anything bought to manufacture product',
    sortOrder: 1,
  },
  {
    name: 'Transport / Logistics',
    description: 'Freight, courier, loading/unloading labour, vehicle rental for delivering goods, toll',
    sortOrder: 2,
  },
  {
    name: 'Fuel',
    description: 'Petrol, diesel, CNG for bikes/vans/cars used for business travel or delivery',
    sortOrder: 3,
  },
  {
    name: 'Staff / Labour',
    description: 'Wages, daily labour, helper payments, overtime, staff food/tea during work',
    sortOrder: 4,
  },
  {
    name: 'Marketing',
    description: 'Social media ads (Instagram/Facebook boost), printing, banners, photography, WhatsApp Business tools, promotional giveaways',
    sortOrder: 5,
  },
  {
    name: 'Site / Rent',
    description: 'Shed/warehouse rent, electricity, water, maintenance at SIDCO or any site',
    sortOrder: 6,
  },
  {
    name: 'Dealer / Referral Payout',
    description: 'Commission or referral payments to SK Enterprises or other dealers/distributors',
    sortOrder: 7,
  },
  {
    name: 'Equipment / Tools',
    description: 'Spray guns, mixers, application tools, safety gear, small machinery purchase or repair',
    sortOrder: 8,
  },
  {
    name: 'Office / Admin',
    description: 'Stationery, printing documents, phone/internet recharge, bank charges, GST filing fees',
    sortOrder: 9,
  },
  {
    name: 'Client Entertainment',
    description: 'Tea/food/hospitality for clients, institutional visitors (NABARD, MABIF, NIFTEM, TVS Rubber etc.)',
    sortOrder: 10,
  },
  {
    name: 'Misc',
    description: 'Anything that clearly does not fit another category',
    sortOrder: 99,
  },
];

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { description: cat.description, sortOrder: cat.sortOrder, isDefault: true },
      create: { ...cat, isDefault: true },
    });
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} default categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
